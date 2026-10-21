//! Human-in-the-loop for n8n: a workflow reaches an outward-facing step, pauses in
//! a Wait node, and posts its `$execution.resumeUrl` here. Atlas shows the item;
//! your decision (and any edit) resumes the workflow. Nothing outward happens
//! without the click, unless you set that workflow to run on its own.

use crate::config;
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Approval {
    pub id: String,
    pub title: String,
    pub summary: String,
    /// The content to go out; you can edit it before approving.
    pub text: String,
    /// x | linkedin | email | other — informs length limits and the checker.
    pub channel: String,
    pub workflow: String,
    pub resume_url: String,
    /// pending | approved | rejected | failed
    pub status: String,
    pub created: String,
    pub decided: Option<String>,
    pub error: Option<String>,
    /// What the draft checker flagged, if the text came from an Atlas task.
    pub flags: Vec<String>,
}

fn dir() -> PathBuf {
    config::config_path().with_file_name("approvals")
}

fn path(id: &str) -> Result<PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(Error::msg("bad approval id"));
    }
    Ok(dir().join(format!("{id}.json")))
}

fn save(a: &Approval) -> Result<()> {
    std::fs::create_dir_all(dir())?;
    std::fs::write(path(&a.id)?, serde_json::to_string_pretty(a)?)?;
    Ok(())
}

/// Resume URLs must point at the local n8n, or approving would let any caller of
/// the API make Atlas POST to an arbitrary address.
fn resume_allowed(url: &str, n8n: &str) -> bool {
    let base = n8n.trim_end_matches('/');
    let localhost = base.replace("127.0.0.1", "localhost");
    url.starts_with(&format!("{base}/")) || url.starts_with(&format!("{localhost}/"))
}

pub fn create(app: &AppHandle, mut a: Approval) -> Result<Approval> {
    let cfg = config::load()?;
    if !a.resume_url.is_empty() && !resume_allowed(&a.resume_url, &cfg.n8n_url) {
        return Err(Error::msg("resumeUrl must point at the local n8n instance"));
    }
    a.id = format!("ap-{}", &uuid::Uuid::new_v4().simple().to_string()[..10]);
    a.status = "pending".into();
    a.created = chrono::Local::now().to_rfc3339();
    if !a.text.is_empty() {
        // Same checker as Atlas drafts: limits and ungrounded claims, against the resume and profile.
        a.flags = crate::tasks::check_against_profile(&a.text, &a.channel);
    }
    save(&a)?;
    let _ = app.emit("approval-event", a.clone());
    Ok(a)
}

#[tauri::command]
pub fn approvals_list() -> Result<Vec<Approval>> {
    let mut out: Vec<Approval> = std::fs::read_dir(dir()).into_iter().flatten().flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).ok())
        .collect();
    out.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(out)
}

/// Approve (optionally with edited text) or reject; resumes the waiting workflow.
#[tauri::command]
pub async fn approval_decide(app: AppHandle, id: String, approve: bool, text: Option<String>) -> Result<Approval> {
    let mut a: Approval = serde_json::from_str(&std::fs::read_to_string(path(&id)?)?)?;
    if a.status != "pending" {
        return Err(Error::msg(format!("already {}", a.status)));
    }
    if let Some(t) = text {
        a.text = t;
    }
    a.decided = Some(chrono::Local::now().to_rfc3339());
    a.status = if approve { "approved".into() } else { "rejected".into() };
    if !a.resume_url.is_empty() {
        let res = reqwest::Client::new().post(&a.resume_url)
            .timeout(std::time::Duration::from_secs(20))
            .json(&serde_json::json!({ "approved": approve, "text": a.text, "approvalId": a.id }))
            .send().await;
        match res {
            Ok(r) if r.status().is_success() => {}
            Ok(r) => { a.status = "failed".into(); a.error = Some(format!("n8n answered {} — the workflow may have timed out", r.status())); }
            Err(e) => { a.status = "failed".into(); a.error = Some(format!("couldn't reach n8n: {e}")); }
        }
    }
    save(&a)?;
    let _ = app.emit("approval-event", a.clone());
    Ok(a)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_urls_are_pinned_to_local_n8n() {
        let n8n = "http://127.0.0.1:5678";
        assert!(resume_allowed("http://localhost:5678/webhook-waiting/123", n8n));
        assert!(resume_allowed("http://127.0.0.1:5678/webhook-waiting/123", n8n));
        assert!(!resume_allowed("http://evil.example/webhook-waiting/123", n8n));
        assert!(!resume_allowed("http://127.0.0.1:5678.evil.example/x", n8n), "prefix tricks");
    }
}
