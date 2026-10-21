//! n8n: the hands to Atlas's brain. n8n owns schedules, triggers and the OAuth'd
//! integrations (X, Outlook, Sheets, …); Atlas owns the agents and the approval
//! gate. Workflows call Atlas's API; outward steps pause for you in Atlas.

use crate::config;
use crate::error::{Error, Result};
use crate::secrets;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;

// ──────────────────────────────────────────────────────────────── notes ──

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct Note {
    pub at: String,
    pub title: String,
    pub body: String,
    pub source: String,
}

fn notes_path() -> PathBuf {
    config::config_path().with_file_name("notes.jsonl")
}

pub fn push_note(title: &str, body: &str, source: &str) -> Result<()> {
    use std::io::Write;
    let n = Note { at: chrono::Local::now().to_rfc3339(), title: title.into(), body: body.into(), source: source.into() };
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(notes_path())?;
    writeln!(f, "{}", serde_json::to_string(&n)?)?;
    Ok(())
}

#[tauri::command]
pub fn notes_list() -> Result<Vec<Note>> {
    let text = std::fs::read_to_string(notes_path()).unwrap_or_default();
    let mut v: Vec<Note> = text.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
    v.reverse();
    v.truncate(60);
    Ok(v)
}

// ─────────────────────────────────────────────────────────────── status ──

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    id: String,
    name: String,
    active: bool,
    updated: String,
    atlas: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Execution {
    id: String,
    workflow_id: String,
    status: String,
    mode: String,
    started: String,
    stopped: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    reachable: bool,
    has_key: bool,
    /// "api" when listing through the n8n API, "cli" before an API key exists.
    via: String,
    url: String,
    workflows: Vec<Workflow>,
    executions: Vec<Execution>,
    error: Option<String>,
}

pub(crate) fn docker() -> Option<PathBuf> {
    ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/Applications/Docker.app/Contents/Resources/bin/docker"]
        .iter().map(PathBuf::from).find(|p| p.exists())
}

/// `n8n list:workflow` inside the container: works before you've created an API key.
fn cli_workflows() -> Vec<Workflow> {
    let Some(d) = docker() else { return vec![] };
    let Ok(o) = std::process::Command::new(d).args(["exec", "atlas-n8n", "n8n", "list:workflow"]).output() else { return vec![] };
    String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| l.split_once('|')).map(|(id, name)| Workflow {
        atlas: name.starts_with("Atlas"), id: id.trim().into(), name: name.trim().into(), active: false, updated: String::new(),
    }).collect()
}

async fn api(path: &str, method: reqwest::Method) -> Result<Value> {
    let cfg = config::load()?;
    let key = secrets::get("n8n_api_key")?.ok_or_else(|| Error::msg("no n8n API key"))?;
    let r = reqwest::Client::new().request(method, format!("{}/api/v1{path}", cfg.n8n_url.trim_end_matches('/')))
        .header("X-N8N-API-KEY", key).timeout(Duration::from_secs(15)).send().await?;
    let status = r.status();
    let v: Value = r.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(Error::msg(format!("n8n {status}: {}", v["message"].as_str().unwrap_or(""))));
    }
    Ok(v)
}

#[tauri::command]
pub async fn n8n_status() -> Result<Status> {
    let cfg = config::load()?;
    let reachable = reqwest::Client::new().get(format!("{}/healthz", cfg.n8n_url)).timeout(Duration::from_secs(4)).send().await
        .is_ok_and(|r| r.status().is_success());
    let has_key = secrets::get("n8n_api_key")?.is_some();
    let mut s = Status { reachable, has_key, via: String::new(), url: cfg.n8n_url.clone(), workflows: vec![], executions: vec![], error: None };
    if !reachable {
        s.error = Some("n8n isn't running. Start Docker; the atlas-n8n container restarts on its own.".into());
        return Ok(s);
    }
    if has_key {
        match api("/workflows?limit=100", reqwest::Method::GET).await {
            Ok(v) => {
                s.via = "api".into();
                s.workflows = v["data"].as_array().into_iter().flatten().map(|w| Workflow {
                    id: w["id"].as_str().unwrap_or("").into(),
                    name: w["name"].as_str().unwrap_or("").into(),
                    active: w["active"].as_bool().unwrap_or(false),
                    updated: w["updatedAt"].as_str().unwrap_or("").into(),
                    atlas: w["name"].as_str().unwrap_or("").starts_with("Atlas"),
                }).collect();
                if let Ok(e) = api("/executions?limit=40", reqwest::Method::GET).await {
                    s.executions = e["data"].as_array().into_iter().flatten().map(|x| Execution {
                        id: x["id"].to_string().trim_matches('"').into(),
                        workflow_id: x["workflowId"].to_string().trim_matches('"').into(),
                        status: x["status"].as_str().unwrap_or(if x["finished"].as_bool() == Some(true) { "success" } else { "unknown" }).into(),
                        mode: x["mode"].as_str().unwrap_or("").into(),
                        started: x["startedAt"].as_str().unwrap_or("").into(),
                        stopped: x["stoppedAt"].as_str().map(String::from),
                    }).collect();
                }
                return Ok(s);
            }
            Err(e) => s.error = Some(e.to_string()),
        }
    }
    s.via = "cli".into();
    s.workflows = tokio::task::spawn_blocking(cli_workflows).await.unwrap_or_default();
    Ok(s)
}

#[tauri::command]
pub async fn n8n_set_active(id: String, active: bool) -> Result<()> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(Error::msg("bad workflow id"));
    }
    api(&format!("/workflows/{id}/{}", if active { "activate" } else { "deactivate" }), reqwest::Method::POST).await?;
    Ok(())
}

// ─────────────────────────────────────────────────────────── templates ──

pub(crate) fn nid() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub(crate) fn http(name: &str, method: &str, path: &str, body: Option<&str>, x: i64) -> Value {
    let mut p = json!({
        "method": method,
        "url": format!("={{{{ $env.ATLAS_API_URL }}}}{path}"),
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.ATLAS_API_TOKEN }}" }] },
        "options": { "timeout": 600000 }
    });
    if let Some(b) = body {
        p["sendBody"] = json!(true);
        p["specifyBody"] = json!("json");
        p["jsonBody"] = json!(b);
    }
    json!({ "id": nid(), "name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [x, 300], "parameters": p })
}

fn schedule(cron: &str) -> Value {
    json!({ "id": nid(), "name": "Schedule", "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [0, 300],
        "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": cron }] } } })
}

/// Chains nodes left to right: each node's main output feeds the next. A "Run now"
/// manual trigger also feeds the first step, so Atlas (or the n8n CLI) can run any
/// workflow on demand, active or not.
pub(crate) fn workflow(id: &str, name: &str, mut nodes: Vec<Value>) -> Value {
    let mut conns = serde_json::Map::new();
    for w in nodes.windows(2) {
        let (a, b) = (w[0]["name"].as_str().unwrap_or(""), w[1]["name"].as_str().unwrap_or(""));
        conns.insert(a.into(), json!({ "main": [[{ "node": b, "type": "main", "index": 0 }]] }));
    }
    if let Some(first_step) = nodes.get(1).and_then(|n| n["name"].as_str()).map(String::from) {
        conns.insert("Run now".into(), json!({ "main": [[{ "node": first_step, "type": "main", "index": 0 }]] }));
        nodes.push(json!({ "id": nid(), "name": "Run now", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [0, 520], "parameters": {} }));
    }
    json!({ "id": id, "name": name, "nodes": nodes, "connections": conns, "active": false, "settings": { "executionOrder": "v1" } })
}

// Stable ids: re-installing replaces a template instead of duplicating it.
pub const MORNING: &str = "ppE1d2byElE1RVBb";
pub const HANDSHAKE: &str = "wq18zvSlC0GYeVOZ";
pub const APPROVE_X: &str = "NaUtGMvacIdpr7sJ";
pub const SUNDAY: &str = "evf806TcK1oDThCs";

pub fn templates() -> Vec<Value> {
    vec![
        // Facts from code, judgment from the model: Atlas computes today's classes,
        // the Chief only writes priorities, and n8n stitches the two together.
        workflow(MORNING, "Atlas · Morning brief", vec![
            schedule("30 7 * * 1-5"),
            http("Get today", "GET", "/v1/today", None, 260),
            http("Ask the Chief of Staff", "POST", "/v1/agents/chief/ask",
                Some(r#"={{ JSON.stringify({ question: "My classes are handled separately. Give me exactly 4 lines, most important first: the single highest-leverage thing to do today for my internship search, then for my projects. Concrete actions, no class schedule." }) }}"#), 520),
            http("Send to Atlas", "POST", "/v1/notify",
                Some(r#"={{ JSON.stringify({ title: "Morning brief", body: $('Get today').item.json.text + "\n\n" + $json.answer, source: "Morning brief" }) }}"#), 780),
        ]),
        workflow(HANDSHAKE, "Atlas · Handshake → outreach drafts", vec![
            schedule("0 */6 * * *"),
            http("Scan the inbox", "POST", "/v1/inbox/scan", Some("={{ JSON.stringify({}) }}"), 260),
            http("Strong new matches", "GET", "/v1/opportunities?min_score=80&status=new", None, 520),
            http("Draft a recruiter email", "POST", "/v1/tasks",
                Some(r#"={{ JSON.stringify({ kind: "outreach", title: "Email · " + $json.title + " — " + $json.employer, input: { opportunityId: $json.id, channel: "email", recipient: "recruiter" } }) }}"#), 780),
        ]),
        {
            let mut w = workflow(APPROVE_X, "Atlas · Approve, then post to X", vec![
                json!({ "id": nid(), "name": "Incoming post", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 300], "webhookId": nid(),
                    "parameters": { "httpMethod": "POST", "path": "atlas-post-x", "options": {} } }),
                http("Ask me in Atlas", "POST", "/v1/approvals",
                    Some(r#"={{ JSON.stringify({ title: "Post to X", text: $json.body.text, channel: "x", workflow: "Atlas · Approve, then post to X", resumeUrl: $execution.resumeUrl }) }}"#), 260),
                json!({ "id": nid(), "name": "Wait for the decision", "type": "n8n-nodes-base.wait", "typeVersion": 1.1, "position": [520, 300], "webhookId": nid(),
                    "parameters": { "resume": "webhook", "httpMethod": "POST", "limitWaitTime": true, "resumeAmount": 2, "resumeUnit": "days", "options": {} } }),
                json!({ "id": nid(), "name": "Only if approved", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [780, 300],
                    "parameters": { "jsCode": "return $input.all()\n  .filter(i => i.json.body && i.json.body.approved === true)\n  .map(i => ({ json: { text: i.json.body.text } }));" } }),
                json!({ "id": nid(), "name": "Post to X", "type": "n8n-nodes-base.twitter", "typeVersion": 2, "position": [1040, 300],
                    "parameters": { "text": "={{ $json.text }}", "additionalFields": {} } }),
            ]);
            w["meta"] = json!({ "note": "Connect your X account on the 'Post to X' node before activating." });
            w
        },
        workflow(SUNDAY, "Atlas · Sunday content plan", vec![
            schedule("0 18 * * 0"),
            http("LinkedIn post about Atlas", "POST", "/v1/tasks",
                Some(r#"={{ JSON.stringify({ kind: "post", title: "Weekly LinkedIn · Atlas", input: { channel: "linkedin", project: "atlas" } }) }}"#), 260),
            http("X post about this week's work", "POST", "/v1/tasks",
                Some(r#"={{ JSON.stringify({ kind: "post", title: "Weekly X post", input: { channel: "x", project: "pay" } }) }}"#), 520),
            http("Tell Atlas", "POST", "/v1/notify",
                Some(r#"={{ JSON.stringify({ title: "Weekly drafts ready", body: "Your Sunday drafts are in the Content queue.", source: "Sunday content plan" }) }}"#), 780),
        ]),
    ]
}

/// Writes the templates into n8n's data folder and imports them (inactive) with the
/// n8n CLI. Existing ones are left alone so your edits in n8n survive, unless `force`.
#[tauri::command]
pub async fn n8n_install_templates(force: Option<bool>) -> Result<Vec<String>> {
    let force = force.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        let d = docker().ok_or_else(|| Error::msg("Docker CLI not found"))?;
        let existing: Vec<String> = if force { vec![] } else { cli_workflows().into_iter().map(|w| w.id).collect() };
        let dir = config::config_path().with_file_name("n8n/atlas-templates");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir)?;
        let mut installed = Vec::new();
        for (i, t) in templates().into_iter().enumerate() {
            let name = t["name"].as_str().unwrap_or("").to_string();
            if existing.iter().any(|id| id == t["id"].as_str().unwrap_or("")) {
                continue;
            }
            std::fs::write(dir.join(format!("{i}.json")), serde_json::to_string_pretty(&t)?)?;
            installed.push(name);
        }
        if installed.is_empty() {
            return Ok(installed);
        }
        let o = std::process::Command::new(d)
            .args(["exec", "atlas-n8n", "n8n", "import:workflow", "--separate", "--input=/home/node/.n8n/atlas-templates"])
            .output()?;
        if !o.status.success() {
            return Err(Error::msg(format!("n8n import failed: {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or(""))));
        }
        Ok(installed)
    }).await.map_err(|e| Error::msg(e.to_string()))?
}

/// Runs a workflow once, now, through the n8n CLI (works before any API key and on
/// inactive workflows). A separate task-broker port avoids clashing with the server.
#[tauri::command]
pub async fn n8n_run(id: String) -> Result<String> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(Error::msg("bad workflow id"));
    }
    let out = tokio::time::timeout(Duration::from_secs(900), tokio::task::spawn_blocking(move || {
        let d = docker().ok_or_else(|| Error::msg("Docker CLI not found"))?;
        let o = std::process::Command::new(d)
            .args(["exec", "-e", "N8N_RUNNERS_BROKER_PORT=5690", "atlas-n8n", "n8n", "execute", &format!("--id={id}")])
            .output()?;
        let text = format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
        Ok::<_, Error>((o.status.success() && !text.contains("Execution error"), text))
    })).await.map_err(|_| Error::msg("the workflow ran longer than 15 minutes"))?.map_err(|e| Error::msg(e.to_string()))??;
    let (ok, text) = out;
    // The Python-runner warning is noise for JavaScript-only workflows.
    let useful: Vec<&str> = text.lines().filter(|l| !l.contains("Python task runner") && !l.trim().is_empty()).collect();
    if ok { Ok("ran".into()) } else { Err(Error::msg(useful.iter().rev().take(3).rev().cloned().collect::<Vec<_>>().join(" · "))) }
}

#[cfg(test)]
mod tests {
    #[test]
    fn templates_are_chained_inactive_and_runnable() {
        for t in super::templates() {
            let nodes = t["nodes"].as_array().unwrap();
            assert!(!t["active"].as_bool().unwrap(), "templates must import inactive");
            assert!(nodes.iter().any(|n| n["type"] == "n8n-nodes-base.manualTrigger"), "{} needs a Run now trigger", t["name"]);
            // chain links + the Run now link
            assert_eq!(t["connections"].as_object().unwrap().len(), nodes.len() - 1, "{}", t["name"]);
        }
    }
}

#[cfg(test)]
mod live {
    /// Imports the templates into the running atlas-n8n container.
    ///   cargo test install_templates_live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn install_templates_live() {
        let r = super::n8n_install_templates(Some(true)).await;
        println!("{r:?}");
        for w in super::cli_workflows() { println!("  {} | {}", w.id, w.name); }
        assert!(r.is_ok());
    }

    /// Approval gate end to end with a throwaway workflow (no X step): it asks Atlas,
    /// pauses at Wait; we resume it exactly as Atlas's Approve button does.
    ///   cargo test approval_gate_live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn approval_gate_live() {
        use serde_json::json;
        let id = "atlasGateTest0001";
        let wf = super::workflow(id, "Atlas · gate test", vec![
            json!({ "id": super::nid(), "name": "Start", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [0, 300], "parameters": {} }),
            super::http("Ask me in Atlas", "POST", "/v1/approvals",
                Some(r#"={{ JSON.stringify({ title: "Gate test", text: "draft from n8n", channel: "x", workflow: "Atlas · gate test", resumeUrl: $execution.resumeUrl }) }}"#), 260),
            json!({ "id": super::nid(), "name": "Wait", "type": "n8n-nodes-base.wait", "typeVersion": 1.1, "position": [520, 300], "webhookId": super::nid(),
                "parameters": { "resume": "webhook", "httpMethod": "POST", "options": {} } }),
            super::http("Report back", "POST", "/v1/notify",
                Some(r#"={{ JSON.stringify({ title: "Gate test resumed", body: "approved=" + $json.body.approved + " text=" + $json.body.text, source: "gate test" }) }}"#), 780),
        ]);
        let dir = crate::config::config_path().with_file_name("n8n/atlas-templates");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("gate.json"), serde_json::to_string(&wf).unwrap()).unwrap();
        let d = super::docker().unwrap();
        let o = std::process::Command::new(&d).args(["exec", "atlas-n8n", "n8n", "import:workflow", "--separate", "--input=/home/node/.n8n/atlas-templates"]).output().unwrap();
        assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));

        let before = crate::approvals::approvals_list().unwrap().len();
        let run = tokio::spawn(super::n8n_run(id.into()));
        let mut ap = None;
        for _ in 0..60 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let list = crate::approvals::approvals_list().unwrap();
            if list.len() > before { ap = list.into_iter().next(); break; }
        }
        let ap = ap.expect("workflow never asked Atlas for approval");
        println!("approval {} waiting · resume {}", ap.id, ap.resume_url);
        // Exactly the POST approval_decide makes:
        let r = reqwest::Client::new().post(&ap.resume_url).json(&json!({ "approved": true, "text": "edited in Atlas", "approvalId": ap.id })).send().await.unwrap();
        println!("resume → {}", r.status());
        println!("run: {:?}", tokio::time::timeout(std::time::Duration::from_secs(60), run).await);
        // The resumed run finishes inside the n8n server after the 200; wait for its note.
        let mut last = crate::n8n::notes_list().unwrap().into_iter().next().unwrap();
        for _ in 0..30 {
            if last.title == "Gate test resumed" { break; }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            last = crate::n8n::notes_list().unwrap().into_iter().next().unwrap();
        }
        println!("note: {} — {}", last.title, last.body);
        assert_eq!(last.title, "Gate test resumed");
        assert!(last.body.contains("edited in Atlas"));
    }

    ///   cargo test run_morning_brief_live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn run_morning_brief_live() {
        let t = std::time::Instant::now();
        println!("{:?} in {:?}", super::n8n_run(super::MORNING.into()).await, t.elapsed());
    }
}
