//! Identities: who a post speaks for (you, a business, another business), each with
//! its own voice, source projects, rules, and connected accounts. An account
//! posts through one route:
//!
//!   n8n        X / LinkedIn — a per-account workflow holding that account's sign-in
//!   metricool  Instagram / TikTok / YouTube / Threads — Metricool already did the
//!              platform reviews; Atlas copies the text and opens your planner
//!   manual     copy + open the composer — always available
//!
//! Posting only ever happens after you approve a draft.

use crate::config;
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    /// x | linkedin | threads | instagram | tiktok | youtube | bluesky
    pub platform: String,
    pub handle: String,
    /// n8n | metricool | manual
    pub route: String,
    pub n8n_workflow_id: String,
    pub metricool_brand: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Identity {
    pub id: String,
    pub name: String,
    /// personal | business
    pub kind: String,
    /// One or two sentences on how this identity sounds.
    pub voice: String,
    /// Project ids whose commits and roadmap are this identity's material.
    pub projects: Vec<String>,
    /// Phrases this identity must never use (checked on every draft).
    pub banned: Vec<String>,
    /// A line the drafts must respect (e.g. "analytics, not betting advice").
    pub rules: Vec<String>,
    pub accent: String,
    pub accounts: Vec<Account>,
}

fn path() -> PathBuf {
    config::config_path().with_file_name("identities.json")
}

fn defaults() -> Vec<Identity> {
    let acct = |id: &str, platform: &str, handle: &str, route: &str, brand: &str| Account {
        id: id.into(), platform: platform.into(), handle: handle.into(), route: route.into(), metricool_brand: brand.into(), ..Default::default()
    };
    let me = config::load().map(|c| c.profile).unwrap_or_default();
    vec![
        Identity {
            id: "personal".into(),
            name: if me.name.is_empty() { "Me".into() } else { me.first() },
            kind: "personal".into(),
            accent: "#3987e5".into(),
            voice: format!("First person, plain, a little dry. {}; honest about what's hard.", me.about),
            accounts: vec![acct("personal-x", "x", "", "manual", ""), acct("personal-linkedin", "linkedin", "", "manual", "")],
            ..Default::default()
        },
        // An example business so the setup is visible on first run; rename or remove it.
        Identity {
            id: "brand".into(),
            name: "My Brand".into(),
            kind: "business".into(),
            accent: "#d95926".into(),
            voice: "Confident, specific and concise. Shows what the product does; never hypes.".into(),
            banned: ["guaranteed", "can't lose", "free money", "sure thing", "risk-free", "game-changer"].map(String::from).to_vec(),
            rules: vec!["Never promise results the product can't guarantee.".into()],
            accounts: vec![acct("brand-x", "x", "", "manual", ""), acct("brand-instagram", "instagram", "", "metricool", "")],
            ..Default::default()
        },
    ]
}

pub fn load() -> Vec<Identity> {
    match std::fs::read_to_string(path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| defaults()),
        Err(_) => {
            let d = defaults();
            let _ = save(&d);
            d
        }
    }
}

fn save(list: &[Identity]) -> Result<()> {
    let tmp = path().with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(list)?)?;
    std::fs::rename(tmp, path())?;
    Ok(())
}

pub fn find(identity: &str) -> Option<Identity> {
    load().into_iter().find(|i| i.id == identity)
}

fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[tauri::command]
pub fn identities_get() -> Result<Vec<Identity>> {
    Ok(load())
}

#[tauri::command]
pub fn identities_save(list: Vec<Identity>) -> Result<()> {
    for i in &list {
        if !valid_id(&i.id) || i.accounts.iter().any(|a| !valid_id(&a.id)) {
            return Err(Error::msg("ids may only contain letters, digits and dashes"));
        }
    }
    save(&list)
}

// ─────────────────────────────────────────────────── n8n per-account flows ──

/// A stable 16-char n8n id from the account id, so reconnecting replaces the
/// workflow rather than duplicating it.
fn workflow_id(account: &str) -> String {
    let h = account.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3));
    format!("atlasPost{:07x}", h & 0xfffffff).chars().take(16).collect()
}

fn webhook_path(account: &str) -> String {
    format!("atlas-post-{account}")
}

/// Webhook → verify it's Atlas calling → post. Approval already happened in Atlas.
fn post_workflow(identity: &Identity, a: &Account) -> Result<Value> {
    let (node_type, version, params) = match a.platform.as_str() {
        "x" => ("n8n-nodes-base.twitter", 2, json!({ "text": "={{ $json.text }}", "additionalFields": {} })),
        "linkedin" => ("n8n-nodes-base.linkedIn", 1, json!({ "postAs": if identity.kind == "business" { "organization" } else { "person" },
            "text": "={{ $json.text }}", "additionalFields": {} })),
        other => return Err(Error::msg(format!("{other} posts through Metricool or manually, not n8n"))),
    };
    let nid = || uuid::Uuid::new_v4().to_string();
    let platform_name = if a.platform == "x" { "X" } else { "LinkedIn" };
    let handle = if a.handle.is_empty() { String::new() } else { format!(" @{}", a.handle.trim_start_matches('@')) };
    let name = format!("Atlas · Post · {} · {platform_name}{handle}", identity.name);
    let post_node = format!("Post to {platform_name}");
    Ok(json!({
        "id": workflow_id(&a.id), "name": name, "active": false, "settings": { "executionOrder": "v1" },
        "nodes": [
            { "id": nid(), "name": "From Atlas", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 300], "webhookId": nid(),
              "parameters": { "httpMethod": "POST", "path": webhook_path(&a.id), "responseMode": "lastNode", "options": {} } },
            { "id": nid(), "name": "Only Atlas may post", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [260, 300],
              "parameters": { "jsCode": "const item = $input.first().json;\nif ((item.headers || {})['x-atlas-token'] !== $env.ATLAS_API_TOKEN) {\n  throw new Error('rejected: not called by Atlas');\n}\nconst text = String((item.body || {}).text || '').trim();\nif (!text) throw new Error('empty post');\nreturn [{ json: { text } }];" } },
            { "id": nid(), "name": post_node, "type": node_type, "typeVersion": version, "position": [520, 300], "parameters": params },
        ],
        "connections": {
            "From Atlas": { "main": [[{ "node": "Only Atlas may post", "type": "main", "index": 0 }]] },
            "Only Atlas may post": { "main": [[{ "node": post_node, "type": "main", "index": 0 }]] },
        },
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connected {
    workflow_id: String,
    editor_url: String,
}

/// Creates (or replaces) the account's posting workflow in n8n and returns where to
/// sign in. The sign-in itself happens in n8n — it's your account, your click.
#[tauri::command]
pub async fn account_connect_n8n(identity_id: String, account_id: String) -> Result<Connected> {
    let mut list = load();
    let ident = list.iter().find(|i| i.id == identity_id).cloned().ok_or_else(|| Error::msg("no such identity"))?;
    let acct = ident.accounts.iter().find(|a| a.id == account_id).cloned().ok_or_else(|| Error::msg("no such account"))?;
    let wf = post_workflow(&ident, &acct)?;
    let id = wf["id"].as_str().unwrap_or("").to_string();
    tokio::task::spawn_blocking(move || -> Result<()> {
        let d = crate::n8n::docker().ok_or_else(|| Error::msg("Docker CLI not found"))?;
        let dir = config::config_path().with_file_name("n8n/atlas-accounts");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir)?;
        std::fs::write(dir.join("account.json"), serde_json::to_string_pretty(&wf)?)?;
        let o = std::process::Command::new(d)
            .args(["exec", "atlas-n8n", "n8n", "import:workflow", "--separate", "--input=/home/node/.n8n/atlas-accounts"]).output()?;
        if !o.status.success() {
            return Err(Error::msg(format!("n8n import failed: {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or(""))));
        }
        Ok(())
    }).await.map_err(|e| Error::msg(e.to_string()))??;
    for i in list.iter_mut().filter(|i| i.id == identity_id) {
        for a in i.accounts.iter_mut().filter(|a| a.id == account_id) {
            a.route = "n8n".into();
            a.n8n_workflow_id = id.clone();
        }
    }
    save(&list)?;
    let base = config::load()?.n8n_url.replace("127.0.0.1", "localhost");
    Ok(Connected { editor_url: format!("{base}/workflow/{id}"), workflow_id: id })
}

/// Posts approved text through an account's n8n workflow. Only called from the
/// review queue after you click — never from an agent or a schedule.
#[tauri::command]
pub async fn post_via_account(identity_id: String, account_id: String, text: String) -> Result<String> {
    let ident = find(&identity_id).ok_or_else(|| Error::msg("no such identity"))?;
    let acct = ident.accounts.iter().find(|a| a.id == account_id).ok_or_else(|| Error::msg("no such account"))?;
    if acct.route != "n8n" {
        return Err(Error::msg("this account doesn't post through n8n"));
    }
    if let Some(limit) = crate::tasks::limit(&acct.platform)
        && text.chars().count() > limit
    {
        return Err(Error::msg(format!("{} characters — over the {limit} limit", text.chars().count())));
    }
    let cfg = config::load()?;
    let token = std::fs::read_to_string(crate::api::token_path()).map(|t| t.trim().to_string()).unwrap_or_default();
    let r = reqwest::Client::new().post(format!("{}/webhook/{}", cfg.n8n_url.trim_end_matches('/'), webhook_path(&acct.id)))
        .header("x-atlas-token", token)
        .timeout(std::time::Duration::from_secs(60))
        .json(&json!({ "text": text }))
        .send().await
        .map_err(|e| Error::msg(format!("couldn't reach n8n: {e}")))?;
    let status = r.status();
    let body = r.text().await.unwrap_or_default();
    if status.as_u16() == 404 {
        return Err(Error::msg("n8n has no live workflow for this account — sign in on its post node and switch the workflow on"));
    }
    if !status.is_success() {
        return Err(Error::msg(format!("n8n {status}: {}", body.chars().take(200).collect::<String>())));
    }
    Ok("posted".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workflow_ids_are_stable_and_valid() {
        let a = workflow_id("brand-x");
        assert_eq!(a, workflow_id("brand-x"));
        assert_ne!(a, workflow_id("personal-x"));
        assert_eq!(a.len(), 16);
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn only_x_and_linkedin_route_through_n8n() {
        let i = &defaults()[1];
        let x = Account { id: "t-x".into(), platform: "x".into(), ..Default::default() };
        let ig = Account { id: "t-ig".into(), platform: "instagram".into(), ..Default::default() };
        let wf = post_workflow(i, &x).unwrap();
        assert_eq!(wf["nodes"].as_array().unwrap().len(), 3);
        assert!(wf["nodes"][1]["parameters"]["jsCode"].as_str().unwrap().contains("ATLAS_API_TOKEN"), "webhook must verify the caller");
        assert!(post_workflow(i, &ig).is_err());
    }
}
