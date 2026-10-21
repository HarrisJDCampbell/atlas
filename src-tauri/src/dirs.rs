//! Directory agents: every folder inside a project is a world with its own agent.
//!
//!   Atlas (orchestrator) ── ask_agent ──► project agent (repo root)
//!                                            └► directory agents (any subfolder)
//!
//! A directory agent starts with a context pack for its folder only (tree, docs,
//! manifest, recent commits) and gets read-only tools — list_dir, read_file,
//! search — that cannot leave that folder. Narrow scope is what lets a small
//! local model be useful: it doesn't have to know the repo, just its corner.
//!
//! Scope is enforced here, in Rust, by canonicalising every path and checking
//! it is still inside the agent's folder. The model's good behaviour is not
//! part of the security model.

use crate::config::{self, Config, ProjectCfg};
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::ipc::Channel;

/// Folders no agent should ever wander into: generated, vendored or huge.
const SKIP: &[&str] = &[
    "node_modules", ".git", "Pods", "build", "dist", "target", ".expo", ".next", "coverage", ".turbo",
    "DerivedData", ".gradle", ".venv", "venv", "__pycache__", ".cache", "out", ".DS_Store",
];

fn skip(name: &str) -> bool {
    SKIP.contains(&name) || name.starts_with('.') && name != ".github"
}

// ──────────────────────────────────────────────────────────────── scope ──

fn canon(p: &Path) -> Result<PathBuf> {
    std::fs::canonicalize(p).map_err(|e| Error::msg(format!("{}: {e}", p.display())))
}

/// Configured projects plus the semester folder, so course folders get agents too.
pub fn roots(cfg: &Config) -> Vec<ProjectCfg> {
    let mut all = cfg.projects.clone();
    all.push(ProjectCfg {
        id: "school".into(),
        name: "School".into(),
        path: cfg.school_root.clone(),
        accent: "#199e70".into(),
        tagline: [cfg.profile.school.as_str(), "coursework", cfg.profile.term.as_str()].iter().filter(|s| !s.is_empty()).copied().collect::<Vec<_>>().join(" "),
        ..Default::default()
    });
    all
}

/// The project whose folder contains `path`, plus the canonical project root.
fn owning_project(cfg: &Config, path: &Path) -> Option<(ProjectCfg, PathBuf)> {
    roots(cfg).into_iter().find_map(|p| {
        let root = canon(&config::expand(&p.path)).ok()?;
        path.starts_with(&root).then_some((p, root))
    })
}

/// Any folder the UI asks about must live inside a configured project.
pub fn resolve_scope(cfg: &Config, path: &str) -> Result<(PathBuf, ProjectCfg, PathBuf)> {
    let p = canon(&config::expand(path))?;
    if !p.is_dir() {
        return Err(Error::msg("not a folder"));
    }
    let (proj, root) = owning_project(cfg, &p).ok_or_else(|| Error::msg("outside every configured project"))?;
    Ok((p, proj, root))
}

/// Resolves a path an agent asked for, relative to its scope. Rejects anything
/// that lands outside — `..`, absolute paths elsewhere, or symlinks pointing out.
pub fn resolve_in(scope: &Path, rel: &str) -> Result<PathBuf> {
    let rel = rel.trim().trim_start_matches("./");
    let joined = if rel.is_empty() || rel == "." { scope.to_path_buf() } else { scope.join(rel) };
    let real = canon(&joined)?;
    if !real.starts_with(scope) {
        return Err(Error::msg(format!("{rel} is outside this agent's folder")));
    }
    Ok(real)
}

// ───────────────────────────────────────────────────────────────── scan ──

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub id: String,
    pub name: String,
    /// orchestrator | project | directory
    pub role: String,
    pub scope: String,
    pub model: String,
    pub seed: u32,
    pub accent: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirNode {
    name: String,
    path: String,
    files: u32,
    dirs: u32,
    commits30d: u32,
    has_docs: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    name: String,
    size: u64,
    modified: Option<String>,
    commits30d: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitNode {
    at: String,
    subject: String,
    files: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirScan {
    path: String,
    name: String,
    /// Path from the project root, "" at the root itself.
    rel: String,
    project_id: String,
    project_name: String,
    crumbs: Vec<(String, String)>,
    children: Vec<DirNode>,
    files: Vec<FileNode>,
    docs: Vec<String>,
    commits: Vec<CommitNode>,
    dirty: u32,
    languages: Vec<(String, u32)>,
    agent: AgentProfile,
}

pub fn stable_seed(s: &str) -> u32 {
    s.bytes().fold(2166136261u32, |h, b| (h ^ b as u32).wrapping_mul(16777619))
}

const DOCS: &[&str] = &["README.md", "AGENTS.md", "CLAUDE.md", "readme.md"];

fn count_tree(dir: &Path, budget: &mut u32, files: &mut u32, dirs: &mut u32, exts: &mut HashMap<String, u32>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let name = e.file_name().to_string_lossy().to_string();
        if skip(&name) {
            continue;
        }
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            *dirs += 1;
            count_tree(&e.path(), budget, files, dirs, exts);
        } else if ft.is_file() {
            *files += 1;
            if let Some(x) = Path::new(&name).extension() {
                *exts.entry(x.to_string_lossy().to_lowercase()).or_default() += 1;
            }
        }
    }
}

/// One `git log` for the folder; paths come back relative to it.
fn git_activity(dir: &Path) -> (Vec<CommitNode>, HashMap<String, u32>, u32) {
    let out = std::process::Command::new("git")
        .arg("-C").arg(dir)
        .args(["log", "--since=30.days.ago", "--relative", "--name-only", "--format=%x1e%cI%x09%s", "--", "."])
        .output();
    let mut commits = Vec::new();
    let mut touched: HashMap<String, u32> = HashMap::new();
    if let Some(o) = out.ok().filter(|o| o.status.success()) {
        for rec in String::from_utf8_lossy(&o.stdout).split('\u{1e}').filter(|r| !r.trim().is_empty()) {
            let mut lines = rec.lines();
            let head = lines.next().unwrap_or("");
            let (at, subject) = head.split_once('\t').unwrap_or((head, ""));
            let files: Vec<&str> = lines.filter(|l| !l.trim().is_empty()).collect();
            let mut firsts: Vec<&str> = files.iter().map(|f| f.split('/').next().unwrap_or(f)).collect();
            firsts.sort();
            firsts.dedup();
            for f in firsts {
                *touched.entry(f.to_string()).or_default() += 1;
            }
            commits.push(CommitNode { at: at.into(), subject: subject.into(), files: files.len() as u32 });
        }
    }
    let dirty = std::process::Command::new("git").arg("-C").arg(dir).args(["status", "--porcelain", "--", "."]).output()
        .ok().filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().count() as u32)
        .unwrap_or(0);
    (commits, touched, dirty)
}

pub fn profile(cfg: &Config, scope: &Path, proj: &ProjectCfg, root: &Path) -> AgentProfile {
    let rel = scope.strip_prefix(root).map(|r| r.display().to_string()).unwrap_or_default();
    let is_root = rel.is_empty();
    let name = if is_root { proj.name.clone() } else { scope.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default() };
    AgentProfile {
        id: format!("dir:{:x}", stable_seed(&scope.display().to_string())),
        name,
        role: if is_root { "project".into() } else { "directory".into() },
        scope: scope.display().to_string(),
        model: if is_root { cfg.agent_models.project.clone() } else { cfg.agent_models.directory.clone() },
        seed: stable_seed(&scope.display().to_string()),
        accent: proj.accent.clone(),
    }
}

pub fn orchestrator(cfg: &Config) -> AgentProfile {
    AgentProfile {
        id: "orchestrator".into(),
        name: "Atlas".into(),
        role: "orchestrator".into(),
        scope: "root".into(),
        model: cfg.agent_models.orchestrator.clone(),
        seed: stable_seed("atlas-orchestrator"),
        accent: "#3987e5".into(),
    }
}

#[tauri::command]
pub async fn dir_scan(path: String) -> Result<DirScan> {
    tokio::task::spawn_blocking(move || scan(&path)).await.map_err(|e| Error::msg(e.to_string()))?
}

#[cfg(test)]
pub fn scan_blocking(path: &str) -> Result<DirScan> {
    scan(path)
}

fn scan(path: &str) -> Result<DirScan> {
    let cfg = config::load()?;
    let (scope, proj, root) = resolve_scope(&cfg, path)?;
    let (commits, touched, dirty) = git_activity(&scope);

    let mut children = Vec::new();
    let mut files = Vec::new();
    let mut exts: HashMap<String, u32> = HashMap::new();
    let mut entries: Vec<_> = std::fs::read_dir(&scope)?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().to_string();
        if skip(&name) {
            continue;
        }
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            let (mut f, mut d, mut budget) = (0, 0, 4000);
            count_tree(&e.path(), &mut budget, &mut f, &mut d, &mut exts);
            let has_docs = DOCS.iter().any(|x| e.path().join(x).exists());
            children.push(DirNode { commits30d: *touched.get(&name).unwrap_or(&0), name, path: e.path().display().to_string(), files: f, dirs: d, has_docs });
        } else if ft.is_file() {
            let meta = e.metadata().ok();
            if let Some(x) = Path::new(&name).extension() {
                *exts.entry(x.to_string_lossy().to_lowercase()).or_default() += 1;
            }
            files.push(FileNode {
                size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                modified: meta.and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Local>::from(t).to_rfc3339()),
                commits30d: *touched.get(&name).unwrap_or(&0),
                name,
            });
        }
    }
    let mut languages: Vec<(String, u32)> = exts.into_iter().collect();
    languages.sort_by_key(|l| std::cmp::Reverse(l.1));
    languages.truncate(6);

    let rel = scope.strip_prefix(&root).map(|r| r.display().to_string()).unwrap_or_default();
    let mut crumbs = vec![(proj.name.clone(), root.display().to_string())];
    let mut acc = root.clone();
    for part in Path::new(&rel).components() {
        acc = acc.join(part);
        crumbs.push((part.as_os_str().to_string_lossy().to_string(), acc.display().to_string()));
    }

    let docs = DOCS.iter().filter(|d| scope.join(d).exists()).map(|d| d.to_string()).collect();
    let agent = profile(&cfg, &scope, &proj, &root);
    Ok(DirScan {
        path: scope.display().to_string(),
        name: agent.name.clone(),
        rel,
        project_id: proj.id.clone(),
        project_name: proj.name.clone(),
        crumbs,
        children,
        files,
        docs,
        commits: commits.into_iter().take(40).collect(),
        dirty,
        languages,
        agent,
    })
}

// ───────────────────────────────────────────────────────────── context ──

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}\n…[truncated]", s.chars().take(n).collect::<String>()) }
}

fn tree(dir: &Path, prefix: &str, depth: u32, lines: &mut Vec<String>) {
    if depth == 0 || lines.len() > 140 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = rd.flatten().filter(|e| !skip(&e.file_name().to_string_lossy())).collect();
    entries.sort_by_key(|e| (!e.path().is_dir(), e.file_name()));
    for e in entries {
        if lines.len() > 140 {
            lines.push(format!("{prefix}…"));
            return;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if e.path().is_dir() {
            lines.push(format!("{prefix}{name}/"));
            tree(&e.path(), &format!("{prefix}  "), depth - 1, lines);
        } else {
            lines.push(format!("{prefix}{name}"));
        }
    }
}

/// What a directory agent knows before it reads anything.
pub fn context_pack(scope: &Path, proj: &ProjectCfg, root: &Path) -> String {
    let rel = scope.strip_prefix(root).map(|r| r.display().to_string()).unwrap_or_default();
    let mut out = format!(
        "You are the agent in charge of the folder `{}` in the project {} ({}).\n",
        if rel.is_empty() { ".".into() } else { rel.clone() }, proj.name, proj.tagline
    );

    let mut lines = Vec::new();
    tree(scope, "", 2, &mut lines);
    out.push_str(&format!("\n## Files (two levels)\n{}\n", lines.join("\n")));

    // Docs in this folder, else the nearest ancestor's (up to the project root).
    let mut d = Some(scope);
    while let Some(dir) = d {
        if let Some((name, text)) = DOCS.iter().find_map(|f| std::fs::read_to_string(dir.join(f)).ok().map(|t| (*f, t))) {
            let whose = if dir == scope { "this folder's".to_string() } else { format!("{}'s", dir.strip_prefix(root).map(|r| r.display().to_string()).unwrap_or_default()) };
            out.push_str(&format!("\n## {name} ({whose})\n{}\n", clip(&text, 3500)));
            break;
        }
        d = if dir == root { None } else { dir.parent() };
    }

    if let Ok(pkg) = std::fs::read_to_string(scope.join("package.json"))
        && let Ok(v) = serde_json::from_str::<Value>(&pkg)
    {
        {
            let keys = |k: &str| v[k].as_object().map(|o| o.keys().cloned().collect::<Vec<_>>().join(", ")).unwrap_or_default();
            out.push_str(&format!("\n## package.json\nname: {}\nscripts: {}\ndependencies: {}\n",
                v["name"].as_str().unwrap_or(""), keys("scripts"), clip(&keys("dependencies"), 900)));
        }
    }

    let log = std::process::Command::new("git").arg("-C").arg(scope)
        .args(["log", "-15", "--format=%cs %s", "--", "."]).output();
    if let Some(o) = log.ok().filter(|o| o.status.success() && !o.stdout.is_empty()) {
        out.push_str(&format!("\n## Recent commits touching this folder\n{}", String::from_utf8_lossy(&o.stdout)));
    }
    clip(&out, 14_000)
}

// ─────────────────────────────────────────────────────────────── tools ──

fn tool_list(scope: &Path, rel: &str) -> String {
    let dir = match resolve_in(scope, rel) {
        Ok(d) => d,
        Err(e) => return e.to_string(),
    };
    let Ok(rd) = std::fs::read_dir(&dir) else { return format!("{rel} is not a folder") };
    let mut items: Vec<String> = rd.flatten().filter(|e| !skip(&e.file_name().to_string_lossy())).map(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        if e.path().is_dir() { format!("{n}/") } else { format!("{n} ({} B)", e.metadata().map(|m| m.len()).unwrap_or(0)) }
    }).collect();
    items.sort();
    items.truncate(200);
    if items.is_empty() { "(empty)".into() } else { items.join("\n") }
}

fn tool_read(scope: &Path, rel: &str, start: usize) -> String {
    let f = match resolve_in(scope, rel) {
        Ok(f) => f,
        Err(e) => return e.to_string(),
    };
    let Ok(bytes) = std::fs::read(&f) else { return format!("could not read {rel}") };
    if bytes.iter().take(4096).any(|b| *b == 0) {
        return format!("{rel} is a binary file");
    }
    let text = String::from_utf8_lossy(&bytes);
    let all: Vec<&str> = text.lines().collect();
    let from = start.saturating_sub(1).min(all.len());
    let to = (from + 220).min(all.len());
    let body: String = all[from..to].iter().enumerate().map(|(i, l)| format!("{:>5}  {l}\n", from + i + 1)).collect();
    let more = if to < all.len() { format!("\n[{} more lines — call read_file with start_line {}]", all.len() - to, to + 1) } else { String::new() };
    format!("{rel} (lines {}-{} of {})\n{}{more}", from + 1, to, all.len(), clip(&body, 14_000))
}

fn tool_search(scope: &Path, pattern: &str) -> String {
    let mut cmd = std::process::Command::new("rg");
    cmd.current_dir(scope).args(["-n", "-S", "--max-count", "4", "--max-columns", "180", "--max-filesize", "1M"]);
    for s in SKIP {
        cmd.arg("-g").arg(format!("!{s}"));
    }
    match cmd.arg("--").arg(pattern).arg(".").output() {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            let lines: Vec<&str> = s.lines().take(60).collect();
            if lines.is_empty() { format!("no matches for `{pattern}`") } else { lines.join("\n") }
        }
        Err(e) => format!("search unavailable: {e}"),
    }
}

fn dir_tools() -> Value {
    json!([
        {"type": "function", "function": {"name": "list_dir", "description": "List a folder inside your area. Paths are relative to your folder; \".\" is your folder.",
            "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
        {"type": "function", "function": {"name": "read_file", "description": "Read a text file inside your area, 220 lines at a time, with line numbers.",
            "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "start_line": {"type": "integer"}}, "required": ["path"]}}},
        {"type": "function", "function": {"name": "search", "description": "Search file contents inside your area (ripgrep, smart case). Returns file:line:text.",
            "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}}}
    ])
}

fn orchestrator_tools(cfg: &Config) -> Value {
    let ids: Vec<String> = cfg.projects.iter().map(|p| p.id.clone()).collect();
    json!([{"type": "function", "function": {"name": "ask_agent",
        "description": "Ask a project's own agent. It can read that project's files, so use it for anything about code, docs or status inside a project.",
        "parameters": {"type": "object", "properties": {
            "project": {"type": "string", "enum": ids},
            "question": {"type": "string"}}, "required": ["project", "question"]}}}])
}

// ──────────────────────────────────────────────────────── retrieval ──

const STOP: &[&str] = &["what", "which", "where", "when", "does", "this", "that", "with", "from", "have", "each",
    "they", "them", "there", "about", "into", "your", "how", "the", "and", "for", "are", "can", "should", "would",
    "could", "make", "work", "works", "file", "files", "code", "folder", "project", "please", "explain", "tell",
    "show", "handle", "handles", "used", "uses", "using", "does", "doing", "want", "need", "like", "also", "then"];

/// The words in a question worth grepping for.
pub fn keywords(q: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for w in q.split(|c: char| !(c.is_alphanumeric() || c == '_')) {
        let lw = w.to_lowercase();
        if w.len() >= 4 && !STOP.contains(&lw.as_str()) && !out.iter().any(|o| o.to_lowercase() == lw) {
            out.push(w.to_string());
        }
    }
    out.truncate(6);
    out
}

fn rg_base(scope: &Path) -> std::process::Command {
    let mut cmd = std::process::Command::new("rg");
    cmd.current_dir(scope).args(["--max-filesize", "1M"]);
    for s in SKIP {
        cmd.arg("-g").arg(format!("!{s}"));
    }
    cmd
}

/// Small models often answer from the context pack instead of looking, so Rust
/// looks first. Files are ranked by IDF-weighted keyword matches: a word in 7 of
/// 711 files ("RevenueCat") says far more than one in 234 ("event"), so rare
/// words dominate and near-universal ones are ignored.
fn prefetch(scope: &Path, question: &str) -> (Vec<String>, String) {
    let kws = keywords(question);
    if kws.is_empty() {
        return (kws, String::new());
    }
    let total = rg_base(scope).arg("--files").output()
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().count()).unwrap_or(0).max(1) as f64;

    let mut per_kw: Vec<(String, Vec<String>)> = Vec::new();
    for k in &kws {
        let Ok(o) = rg_base(scope).args(["-l", "-i", "-F", "--", k, "."]).output() else { continue };
        let files: Vec<String> = String::from_utf8_lossy(&o.stdout).lines().map(|f| f.trim_start_matches("./").to_string()).collect();
        if !files.is_empty() {
            per_kw.push((k.clone(), files));
        }
    }
    // Words in more than a quarter of all files don't discriminate; drop them unless that leaves nothing.
    let useful: Vec<&(String, Vec<String>)> = {
        let u: Vec<_> = per_kw.iter().filter(|(_, f)| (f.len() as f64) <= total * 0.25).collect();
        if u.is_empty() { per_kw.iter().collect() } else { u }
    };
    let mut score: HashMap<&str, f64> = HashMap::new();
    for (_, files) in &useful {
        let idf = (total / files.len() as f64).ln().max(0.1);
        for f in files {
            *score.entry(f.as_str()).or_default() += idf;
        }
    }
    let mut ranked: Vec<(&str, f64)> = score.into_iter().collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));

    let pattern = useful.iter().map(|(k, _)| regex_escape(k)).collect::<Vec<_>>().join("|");
    let mut out = String::new();
    for (i, (file, _)) in ranked.iter().take(3).enumerate() {
        if i == 0 {
            // The best file: include its densest 200-line stretch whole, so the logic
            // a few dozen lines below a match (the part that answers) comes along.
            if let Some(w) = densest_window(scope, file, &pattern, 200) {
                out.push_str(&format!("\n### {file} (lines {}-{})\n{}\n", w.0, w.1, clip(&w.2, 9000)));
                continue;
            }
        }
        let o = std::process::Command::new("rg").current_dir(scope)
            .args(["-n", "-i", "-C", "2", "--max-count", "8", "--max-columns", "200", "-e", &pattern, "--", file]).output();
        if let Ok(o) = o {
            out.push_str(&format!("\n### {file}\n{}\n", clip(&String::from_utf8_lossy(&o.stdout), 1800)));
        }
    }
    (useful.iter().map(|(k, _)| k.clone()).collect(), out)
}

/// The `span`-line window of `file` containing the most matches of `pattern`,
/// returned as (first line, last line, numbered text).
fn densest_window(scope: &Path, file: &str, pattern: &str, span: usize) -> Option<(usize, usize, String)> {
    let o = std::process::Command::new("rg").current_dir(scope).args(["-n", "-i", "-e", pattern, "--", file]).output().ok()?;
    let hits: Vec<usize> = String::from_utf8_lossy(&o.stdout).lines()
        .filter_map(|l| l.split(':').next()?.parse().ok()).collect();
    if hits.is_empty() {
        return None;
    }
    let text = std::fs::read_to_string(scope.join(file)).ok()?;
    let lines: Vec<&str> = text.lines().collect();
    // Two-pointer sweep over sorted hit lines: O(hits).
    let (mut best, mut best_start, mut j) = (0, hits[0], 0);
    for i in 0..hits.len() {
        while hits[j] + span <= hits[i] {
            j += 1;
        }
        if i - j + 1 > best {
            best = i - j + 1;
            best_start = hits[j];
        }
    }
    let from = best_start.saturating_sub(10).max(1);
    let to = (from + span).min(lines.len());
    let body = (from..=to).filter_map(|n| lines.get(n - 1).map(|l| format!("{n:>5}  {l}"))).collect::<Vec<_>>().join("\n");
    Some((from, to, body))
}

fn regex_escape(s: &str) -> String {
    s.chars().flat_map(|c| if "\\.+*?()|[]{}^$".contains(c) { vec!['\\', c] } else { vec![c] }).collect()
}

// ─────────────────────────────────────────────────────────────── loop ──

#[derive(Serialize, Deserialize, Clone)]
pub struct Msg {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
    /// agent is the profile id doing the work (orchestrator, or a delegate).
    Tool { agent: String, agent_name: String, tool: String, detail: String },
    Delegate { to: String, to_name: String, question: String },
    DelegateDone { to: String, chars: usize },
    Answer { text: String, model: String, steps: usize },
}

async fn ollama(cfg: &Config, model: &str, messages: &[Value], tools: Option<&Value>) -> Result<Value> {
    let mut body = json!({"model": model, "messages": messages, "stream": false, "think": false,
        "options": {"num_ctx": 16384, "temperature": 0.2}});
    if let Some(t) = tools {
        body["tools"] = t.clone();
    }
    let resp = reqwest::Client::new().post(format!("{}/api/chat", cfg.ollama_url))
        .timeout(Duration::from_secs(600)).json(&body).send().await
        .map_err(|e| Error::msg(format!("Ollama unreachable: {e}")))?;
    let v: Value = resp.json().await?;
    if let Some(e) = v["error"].as_str() {
        return Err(Error::msg(format!("Ollama: {e}")));
    }
    Ok(v["message"].clone())
}

/// Phrases small models use when they're guessing instead of reading.
fn hedges(text: &str) -> bool {
    let t = text.to_lowercase();
    ["likely", "probably", "not explicitly", "would need to", "typically", "i assume", "may be handled", "infer"]
        .iter().any(|h| t.contains(h))
}

/// Course folders: help him learn, don't do graded work for him (from his own working rules).
const SCHOOL_RULES: &str = "This is coursework. Teach, don't do it for him: explain concepts, work through \
examples, review code or writing he made, quiz him, and point at bugs instead of silently fixing them. If he asks \
you to produce a graded assignment outright, say once that it won't help him in an interview and offer to work \
through it together instead.";

const DIR_RULES: &str = "Answer from the files, not from memory: use search and read_file to check before you \
state anything specific, and cite file paths (with line numbers when you read them). If the answer is outside \
your folder, say so instead of guessing. Be concise and concrete. You can read but cannot change files.";

/// Runs one directory agent to an answer.
async fn run_dir(cfg: &Config, scope: &Path, proj: &ProjectCfg, root: &Path, history: Vec<Msg>, events: &Channel<AgentEvent>) -> Result<(String, usize)> {
    let me = profile(cfg, scope, proj, root);
    let question = history.iter().rev().find(|m| m.role == "user").map(|m| m.content.clone()).unwrap_or_default();
    let (kws, found) = prefetch(scope, &question);
    if !kws.is_empty() {
        let _ = events.send(AgentEvent::Tool { agent: me.id.clone(), agent_name: me.name.clone(), tool: "auto-search".into(), detail: kws.join(", ") });
    }
    let mut system = format!("{}\n\n{DIR_RULES}", context_pack(scope, proj, root));
    if proj.id == "school" {
        system.push_str(&format!("\n\n{SCHOOL_RULES}"));
    }
    if !found.is_empty() {
        system.push_str(&format!("\n\n## Code matching the question (found by search before you were asked)\n{found}\n\
            Use this. If it isn't enough, read the full file with read_file."));
    }
    let mut messages = vec![json!({"role": "system", "content": system})];
    messages.extend(history.into_iter().map(|m| json!({"role": m.role, "content": m.content})));
    let tools = dir_tools();
    let mut steps = 0;
    let mut nudged = false;
    let mut read_any = false;
    for _ in 0..8 {
        let msg = ollama(cfg, &me.model, &messages, Some(&tools)).await?;
        let calls = msg["tool_calls"].as_array().cloned().unwrap_or_default();
        messages.push(msg.clone());
        if calls.is_empty() {
            let text = msg["content"].as_str().unwrap_or("").trim().to_string();
            // Nothing found up front and it didn't look either: make it look once.
            if found.is_empty() && steps == 0 && !nudged && question.len() > 20 {
                nudged = true;
                messages.push(json!({"role": "user", "content": "Check the files with search or read_file before answering."}));
                continue;
            }
            // Hedging without having read a file means it guessed. Send it to the source once.
            if !nudged && !read_any && hedges(&text) {
                nudged = true;
                messages.push(json!({"role": "user", "content": "You're guessing. Open the most relevant file with read_file and answer from the actual code, citing line numbers."}));
                continue;
            }
            return Ok((text, steps));
        }
        for c in calls {
            steps += 1;
            let name = c["function"]["name"].as_str().unwrap_or("").to_string();
            let a = &c["function"]["arguments"];
            let (detail, out) = match name.as_str() {
                "list_dir" => { let p = a["path"].as_str().unwrap_or("."); (p.to_string(), tool_list(scope, p)) }
                "read_file" => {
                    read_any = true;
                    let p = a["path"].as_str().unwrap_or("");
                    let start = a["start_line"].as_u64().unwrap_or(1) as usize;
                    (p.to_string(), tool_read(scope, p, start))
                }
                "search" => { let q = a["pattern"].as_str().unwrap_or(""); (q.to_string(), tool_search(scope, q)) }
                other => (other.to_string(), format!("no tool named {other}")),
            };
            let _ = events.send(AgentEvent::Tool { agent: me.id.clone(), agent_name: me.name.clone(), tool: name.clone(), detail });
            messages.push(json!({"role": "tool", "tool_name": name, "content": out}));
        }
    }
    // Out of steps: make it answer with what it has.
    messages.push(json!({"role": "user", "content": "Answer now with what you found."}));
    let msg = ollama(cfg, &me.model, &messages, None).await?;
    Ok((msg["content"].as_str().unwrap_or("").trim().to_string(), steps))
}

fn orchestrator_context(cfg: &Config) -> String {
    let me = &cfg.profile;
    let mut out = format!("You are Atlas, {}'s orchestrator. {} is {}. Each project has its own agent that can read \
        that project's files. For anything about a specific project's code, docs or state, delegate with ask_agent \
        — ask focused questions, then combine their answers. For planning and prioritisation, answer yourself. \
        {} priorities: {}.\n\n## Projects\n", me.first(), me.first(), me.about, me.possessive(), me.priorities);
    for p in &cfg.projects {
        out.push_str(&format!("- {} ({}): {}\n", p.id, p.name, p.tagline));
    }
    let today = chrono::Local::now().format("%A %Y-%m-%d %H:%M");
    out.push_str(&format!("\nNow: {today}."));
    out.push_str(&format!("\n\n{}", crate::school::today_block(chrono::Local::now())));
    if let Ok(c) = std::fs::read_to_string(config::expand(&cfg.courses_file)) {
        out.push_str(&format!("\n## Full class schedule\n{}", clip(&c, 1500)));
    }
    out
}

pub(crate) async fn run_orchestrator(cfg: &Config, history: Vec<Msg>, events: &Channel<AgentEvent>) -> Result<(String, usize)> {
    let me = orchestrator(cfg);
    let mut messages = vec![json!({"role": "system", "content": orchestrator_context(cfg)})];
    messages.extend(history.into_iter().map(|m| json!({"role": m.role, "content": m.content})));
    let tools = orchestrator_tools(cfg);
    let mut steps = 0;
    for _ in 0..5 {
        let msg = ollama(cfg, &me.model, &messages, Some(&tools)).await?;
        let calls = msg["tool_calls"].as_array().cloned().unwrap_or_default();
        messages.push(msg.clone());
        if calls.is_empty() {
            return Ok((msg["content"].as_str().unwrap_or("").trim().to_string(), steps));
        }
        for c in calls {
            steps += 1;
            let a = &c["function"]["arguments"];
            let pid = a["project"].as_str().unwrap_or("");
            let question = a["question"].as_str().unwrap_or("").to_string();
            let out = match cfg.projects.iter().find(|p| p.id == pid) {
                None => format!("no project '{pid}'"),
                Some(p) => match canon(&config::expand(&p.path)) {
                    Err(e) => format!("{} is unreachable: {e}", p.name),
                    Ok(root) => {
                        let delegate = profile(cfg, &root, p, &root);
                        let _ = events.send(AgentEvent::Delegate { to: delegate.id.clone(), to_name: delegate.name.clone(), question: question.clone() });
                        // Delegates can read but not delegate further: one level, bounded cost.
                        let (ans, _) = run_dir(cfg, &root, p, &root, vec![Msg { role: "user".into(), content: question }], events).await
                            .unwrap_or_else(|e| (format!("(the {} agent failed: {e})", p.name), 0));
                        let _ = events.send(AgentEvent::DelegateDone { to: delegate.id.clone(), chars: ans.len() });
                        format!("{} agent says:\n{ans}", p.name)
                    }
                },
            };
            messages.push(json!({"role": "tool", "tool_name": "ask_agent", "content": out}));
        }
    }
    messages.push(json!({"role": "user", "content": "Answer now with what you have."}));
    let msg = ollama(cfg, &me.model, &messages, None).await?;
    Ok((msg["content"].as_str().unwrap_or("").trim().to_string(), steps))
}

/// Talk to the agent in charge of `scope` ("root" = the orchestrator).
#[tauri::command]
pub async fn dir_agent_chat(scope: String, messages: Vec<Msg>, on_event: Channel<AgentEvent>) -> Result<String> {
    let cfg = config::load()?;
    let (answer, steps, model) = if scope == "root" {
        let (a, s) = run_orchestrator(&cfg, messages, &on_event).await?;
        (a, s, cfg.agent_models.orchestrator.clone())
    } else {
        let (dir, proj, root) = resolve_scope(&cfg, &scope)?;
        let model = profile(&cfg, &dir, &proj, &root).model;
        let (a, s) = run_dir(&cfg, &dir, &proj, &root, messages, &on_event).await?;
        (a, s, model)
    };
    let _ = on_event.send(AgentEvent::Answer { text: answer.clone(), model, steps });
    Ok(answer)
}

#[tauri::command]
pub fn orchestrator_profile() -> Result<AgentProfile> {
    Ok(orchestrator(&config::load()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("atlas-scope-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("inner/deeper")).unwrap();
        std::fs::write(d.join("inner/a.txt"), "hello").unwrap();
        std::fs::write(d.join("secret.txt"), "outside").unwrap();
        canon(&d).unwrap()
    }

    #[test]
    fn scope_cannot_be_escaped() {
        let root = tmp();
        let scope = root.join("inner");
        assert!(resolve_in(&scope, "a.txt").is_ok());
        assert!(resolve_in(&scope, "deeper").is_ok());
        assert!(resolve_in(&scope, "../secret.txt").is_err(), "parent traversal");
        assert!(resolve_in(&scope, root.join("secret.txt").to_str().unwrap()).is_err(), "absolute path elsewhere");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("secret.txt"), scope.join("link.txt")).unwrap();
            assert!(resolve_in(&scope, "link.txt").is_err(), "symlink pointing out");
        }
        assert!(tool_read(&scope, "../secret.txt", 1).contains("outside this agent's folder"));
    }

    /// Whole-word count of the 7 real event types (CANCELLATION must not match inside UNCANCELLATION).
    fn named(answer: &str) -> usize {
        let words: std::collections::HashSet<&str> = answer.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_')).collect();
        ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "EXPIRATION", "CANCELLATION", "BILLING_ISSUE"]
            .iter().filter(|e| words.contains(*e)).count()
    }

    /// Orchestrator must route a VisBets code question to the VisBets agent.
    ///   cargo test orchestrator_delegates -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn orchestrator_delegates() {
        let cfg = config::load().unwrap();
        let (tx, events) = std::sync::mpsc::channel::<String>();
        let ch: Channel<AgentEvent> = Channel::new(move |b| {
            if let tauri::ipc::InvokeResponseBody::Json(j) = b { let _ = tx.send(j); }
            Ok(())
        });
        let q = "In VisBets, which RevenueCat webhook events does the backend handle?";
        let t = std::time::Instant::now();
        let (answer, steps) = run_orchestrator(&cfg, vec![Msg { role: "user".into(), content: q.into() }], &ch).await.unwrap();
        let evs: Vec<String> = events.try_iter().collect();
        for e in &evs { println!("  event {}", &e[..e.len().min(200)]); }
        println!("{steps} delegations · {:?}\n\n{answer}", t.elapsed());
        assert!(evs.iter().any(|e| e.contains("\"delegate\"") && e.contains("VisBets")), "should delegate to the VisBets agent");
        let found = named(&answer);
        println!("\nground truth: {found}/7 event types named");
        assert!(found >= 5);
    }

    /// The semester folder (not a git repo) must work as an agent root, with teaching rules.
    #[test]
    #[ignore]
    fn school_root_scans() {
        let cfg = config::load().unwrap();
        let s = scan(&cfg.school_root).unwrap();
        println!("{} · {} · {} course folders · {} files", s.name, s.agent.role, s.children.len(), s.files.len());
        assert_eq!(s.project_id, "school");
        let course = &s.children[0];
        let (scope, proj, root) = resolve_scope(&cfg, &course.path).unwrap();
        assert_eq!(proj.id, "school");
        let p = profile(&cfg, &scope, &proj, &root);
        println!("{} → {} on {}", course.name, p.role, p.model);
        assert_eq!(p.role, "directory");
    }

    #[test]
    fn keywords_keep_the_specific_words() {
        let k = keywords("Which RevenueCat webhook event types does the backend handle?");
        assert!(k.contains(&"RevenueCat".to_string()) && k.contains(&"webhook".to_string()));
        assert!(!k.iter().any(|w| w.eq_ignore_ascii_case("which") || w.eq_ignore_ascii_case("handle")));
    }

    #[test]
    fn densest_window_finds_the_cluster() {
        let d = tmp();
        let mut body = String::new();
        for i in 1..=400 {
            body.push_str(if i == 5 || (300..=310).contains(&i) { "webhook here\n" } else { "x\n" });
        }
        std::fs::write(d.join("f.ts"), body).unwrap();
        let (from, to, _) = densest_window(&d, "f.ts", "webhook", 100).unwrap();
        assert!(from <= 300 && to >= 310, "window {from}-{to} should cover the 300-310 cluster");
    }

    #[test]
    fn seeds_are_stable() {
        assert_eq!(stable_seed("abc"), stable_seed("abc"));
        assert_ne!(stable_seed("a"), stable_seed("b"));
    }

    /// Ground truth: the VisBets backend handles 7 RevenueCat webhook event types in
    /// backend/src/routes/subscriptions.ts. Needs Ollama + the repo.
    ///   cargo test backend_agent_finds_webhook_events -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn backend_agent_finds_webhook_events() {
        let cfg = config::load().unwrap();
        let p = cfg.projects.iter().find(|p| p.id == "visbets").unwrap();
        let (scope, proj, root) = resolve_scope(&cfg, &format!("{}/backend", p.path)).unwrap();
        let (tx, events) = std::sync::mpsc::channel::<String>();
        let ch: Channel<AgentEvent> = Channel::new(move |b| {
            if let tauri::ipc::InvokeResponseBody::Json(j) = b { let _ = tx.send(j); }
            Ok(())
        });
        let q = "Which RevenueCat webhook event types does the backend handle, and what does it do for each?";
        let t = std::time::Instant::now();
        let (answer, steps) = run_dir(&cfg, &scope, &proj, &root, vec![Msg { role: "user".into(), content: q.into() }], &ch).await.unwrap();
        for e in events.try_iter() { println!("  event {e}"); }
        println!("model {} · {steps} tool calls · {:?}\n\n{answer}", profile(&cfg, &scope, &proj, &root).model, t.elapsed());
        let found = named(&answer);
        println!("\nground truth: {found}/7 event types named");
        assert!(found >= 5, "agent named only {found}/7 event types");
    }
}
