//! Project telemetry: git activity plus roadmap checklists.
//!
//! "Progress" is deliberately something you control: the ratio of checked to
//! unchecked boxes in a markdown roadmap, grouped by heading. Git activity is shown
//! beside it, never blended into it — commits measure effort, not completion.

use crate::config::{self, ProjectCfg};
use crate::error::Result;
use chrono::{Local, NaiveDate};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStatus {
    pub id: String,
    pub name: String,
    pub path: String,
    pub tagline: String,
    pub accent: String,
    pub exists: bool,
    /// Set when the folder couldn't be read, e.g. macOS is waiting on a privacy prompt.
    pub note: Option<String>,
    pub sentry_projects: Vec<String>,
    pub git: Option<GitInfo>,
    pub roadmap: Option<Roadmap>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub branch: String,
    pub last_commit_at: Option<String>,
    pub last_commit_subject: Option<String>,
    pub commits_7d: u32,
    pub dirty_files: u32,
    /// Oldest first, one bucket per day, 30 days ending today.
    pub daily_commits: Vec<u32>,
    pub recent: Vec<Commit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub at: String,
    pub subject: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Roadmap {
    pub file: String,
    pub done: u32,
    pub total: u32,
    pub sections: Vec<Section>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub title: String,
    pub done: u32,
    pub total: u32,
    pub next: Option<String>,
}

const ROADMAP_CANDIDATES: &[&str] =
    &["ROADMAP.md", "docs/ROADMAP.md", "TODO.md", "PLAN.md", "docs/PLAN.md"];

async fn git(dir: &Path, args: &[&str]) -> Option<String> {
    // kill_on_drop: if the caller's timeout fires (e.g. git is stuck behind a macOS
    // privacy prompt), the child dies with the future instead of piling up each poll.
    let out = Command::new("git").arg("-C").arg(dir).args(args).kill_on_drop(true).output().await.ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

async fn git_info(dir: &Path) -> Option<GitInfo> {
    let branch = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    let (last, log30, status) = tokio::join!(
        git(dir, &["log", "-1", "--format=%cI%x09%s"]),
        git(dir, &["log", "--since=30.days.ago", "--format=%cI%x09%s"]),
        git(dir, &["status", "--porcelain"]),
    );

    let (last_commit_at, last_commit_subject) = match last.as_deref().and_then(|l| l.split_once('\t')) {
        Some((at, subj)) => (Some(at.to_string()), Some(subj.to_string())),
        None => (None, None),
    };

    let today = Local::now().date_naive();
    let mut daily = vec![0u32; 30];
    let mut recent = Vec::new();
    for line in log30.as_deref().unwrap_or("").lines() {
        let Some((at, subject)) = line.split_once('\t') else { continue };
        if recent.len() < 15 {
            recent.push(Commit { at: at.to_string(), subject: subject.to_string() });
        }
        // %cI is ISO 8601 with offset; the first 10 chars are the committer's local date.
        if let Ok(d) = NaiveDate::parse_from_str(at.get(..10).unwrap_or(""), "%Y-%m-%d") {
            let age = (today - d).num_days();
            if (0..30).contains(&age) {
                daily[29 - age as usize] += 1;
            }
        }
    }
    let commits_7d = daily[23..].iter().sum();
    let dirty_files = status.map(|s| s.lines().count() as u32).unwrap_or(0);

    Some(GitInfo { branch, last_commit_at, last_commit_subject, commits_7d, dirty_files, daily_commits: daily, recent })
}

pub fn find_roadmap(root: &Path, configured: &str) -> Option<PathBuf> {
    if !configured.is_empty() {
        let p = root.join(configured);
        return p.exists().then_some(p);
    }
    ROADMAP_CANDIDATES.iter().map(|c| root.join(c)).find(|p| p.exists())
}

/// Counts `- [ ]` / `- [x]` items, grouped under the nearest heading.
pub fn parse_roadmap(text: &str) -> (Vec<Section>, u32, u32) {
    let mut sections: Vec<Section> = Vec::new();
    let mut current = Section { title: "General".into(), done: 0, total: 0, next: None };

    for line in text.lines() {
        let t = line.trim_start();
        if let Some(h) = t.strip_prefix('#') {
            if current.total > 0 {
                sections.push(current);
            }
            current = Section { title: h.trim_start_matches('#').trim().to_string(), done: 0, total: 0, next: None };
            continue;
        }
        let item = t
            .strip_prefix("- ")
            .or_else(|| t.strip_prefix("* "))
            .or_else(|| t.split_once(". ").filter(|(n, _)| n.chars().all(|c| c.is_ascii_digit())).map(|(_, r)| r));
        let Some(item) = item else { continue };
        let (checked, rest) = if let Some(r) = item.strip_prefix("[ ]") {
            (false, r)
        } else if let Some(r) = item.strip_prefix("[x]").or_else(|| item.strip_prefix("[X]")) {
            (true, r)
        } else {
            continue;
        };
        current.total += 1;
        if checked {
            current.done += 1;
        } else if current.next.is_none() {
            current.next = Some(rest.trim().to_string());
        }
    }
    if current.total > 0 {
        sections.push(current);
    }
    let done = sections.iter().map(|s| s.done).sum();
    let total = sections.iter().map(|s| s.total).sum();
    (sections, done, total)
}

pub fn roadmap(root: &Path, configured: &str) -> Option<Roadmap> {
    let file = find_roadmap(root, configured)?;
    let text = std::fs::read_to_string(&file).ok()?;
    let (sections, done, total) = parse_roadmap(&text);
    let rel = file.strip_prefix(root).unwrap_or(&file).display().to_string();
    Some(Roadmap { file: rel, done, total, sections })
}

// Folders under ~/Desktop or ~/Documents are privacy-protected: the first read
// blocks until the user answers a macOS prompt. Bound each project so one pending
// prompt can't stall the whole list.
const PROJECT_BUDGET: std::time::Duration = std::time::Duration::from_secs(4);

async fn status(p: ProjectCfg) -> ProjectStatus {
    let dir = config::expand(&p.path);
    // Listing the folder is what macOS gates; a plain is_dir() succeeds even when
    // reading inside would block on the permission prompt.
    let probe = dir.clone();
    let checked = tokio::time::timeout(PROJECT_BUDGET, tokio::task::spawn_blocking(move || std::fs::read_dir(probe).map(|_| ()))).await;
    let (exists, note) = match checked {
        Ok(Ok(Ok(()))) => (true, None),
        Ok(Ok(Err(e))) if e.kind() == std::io::ErrorKind::PermissionDenied => (false, Some(
            "macOS denied access to this folder. Allow Atlas in System Settings → Privacy & Security → Files and Folders.".to_string())),
        Ok(_) => (false, None),
        Err(_) => (false, Some(
            "Waiting on the macOS permission prompt for this folder — check for a dialog asking to let Atlas access it.".to_string())),
    };
    let (git, roadmap) = if exists {
        let rd = dir.clone();
        let rm = p.roadmap.clone();
        let (g, r) = tokio::join!(
            tokio::time::timeout(PROJECT_BUDGET, git_info(&dir)),
            tokio::time::timeout(PROJECT_BUDGET, tokio::task::spawn_blocking(move || roadmap(&rd, &rm))),
        );
        (g.ok().flatten(), r.ok().and_then(|j| j.ok()).flatten())
    } else {
        (None, None)
    };
    ProjectStatus {
        note,
        id: p.id,
        name: p.name,
        path: dir.display().to_string(),
        tagline: p.tagline,
        accent: p.accent,
        exists,
        sentry_projects: p.sentry_projects,
        git,
        roadmap,
    }
}

#[tauri::command]
pub async fn projects_status() -> Result<Vec<ProjectStatus>> {
    let cfg = config::load()?;
    Ok(futures_util::future::join_all(cfg.projects.into_iter().map(status)).await)
}

const ROADMAP_TEMPLATE: &str = "# Roadmap\n\nAtlas reads the checkboxes in this file: each heading becomes a progress bar.\n\n## Now\n- [ ] \n\n## Next\n- [ ] \n\n## Later\n- [ ] \n";

/// Creates ROADMAP.md in a project that has none. Never overwrites.
#[tauri::command]
pub fn roadmap_create(project_id: String) -> Result<String> {
    let cfg = config::load()?;
    let p = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| crate::error::Error::msg("unknown project"))?;
    let root = config::expand(&p.path);
    if let Some(existing) = find_roadmap(&root, &p.roadmap) {
        return Ok(existing.display().to_string());
    }
    let file = root.join("ROADMAP.md");
    std::fs::write(&file, ROADMAP_TEMPLATE)?;
    Ok(file.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_checkboxes_by_heading() {
        let md = "# Roadmap\n- [x] a\n- [ ] b\n\n## Launch\n1. [X] c\n* [ ] d\n- not a task\n## Empty\ntext\n";
        let (s, done, total) = parse_roadmap(md);
        assert_eq!((done, total), (2, 4));
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].title, "Roadmap");
        assert_eq!(s[0].next.as_deref(), Some("b"));
        assert_eq!(s[1].title, "Launch");
        assert_eq!((s[1].done, s[1].total), (1, 2));
    }

    #[test]
    fn no_tasks_means_no_sections() {
        let (s, done, total) = parse_roadmap("# Title\njust prose\n");
        assert!(s.is_empty());
        assert_eq!((done, total), (0, 0));
    }
}
