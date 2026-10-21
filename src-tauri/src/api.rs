//! Atlas's local API, for n8n (or any local tool) to drive its agents.
//!
//! 127.0.0.1 only; every route but /v1/health needs `Authorization: Bearer <token>`.
//! The token is a local IPC secret between Atlas and n8n on this Mac, kept in
//! ~/.config/atlas/api-token (mode 600). Not the Keychain: an ad-hoc-signed app is a
//! new app to the Keychain after every rebuild, and each read would prompt. Real
//! service credentials (Sentry, RevenueCat, n8n API key) stay in the Keychain.

// Handlers return axum's `Response` as their error type — the idiomatic pattern.
// It's large, but these run a few times a minute, so boxing would buy nothing.
#![allow(clippy::result_large_err)]

use crate::{approvals, config, dirs, inbox, research, tasks};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    token: String,
}

type Res = std::result::Result<Json<Value>, Response>;

fn err(code: StatusCode, msg: impl ToString) -> Response {
    (code, Json(json!({ "error": msg.to_string() }))).into_response()
}

fn bad(e: crate::error::Error) -> Response {
    err(StatusCode::BAD_REQUEST, e)
}

/// Constant-time comparison, so response timing doesn't leak the token.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn authed(ctx: &Ctx, h: &HeaderMap) -> std::result::Result<(), Response> {
    let given = h.get("authorization").and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")).unwrap_or("");
    if !ctx.token.is_empty() && same(given, &ctx.token) { Ok(()) } else { Err(err(StatusCode::UNAUTHORIZED, "missing or wrong token")) }
}

/// Today's classes, computed (not model-written), for workflows to quote verbatim.
async fn today(State(c): State<Ctx>, h: HeaderMap) -> Res {
    authed(&c, &h)?;
    let block = crate::school::today_block(chrono::Local::now());
    let mut lines: Vec<String> = block.lines().skip(1).map(String::from).collect(); // drop the heading meant for models
    lines.push(tokio::task::spawn_blocking(crate::code::today_line).await.unwrap_or_default());
    Ok(Json(json!({ "text": lines.join("\n") })))
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "app": "atlas", "version": env!("CARGO_PKG_VERSION") }))
}

#[derive(Deserialize)]
struct Ask {
    question: String,
}

/// Ask an agent. `atlas`/`orchestrator` is the delegating orchestrator; anything
/// else is a configured agent id (chief, interview, quick, …).
async fn ask(State(c): State<Ctx>, h: HeaderMap, Path(id): Path<String>, Json(b): Json<Ask>) -> Res {
    authed(&c, &h)?;
    let answer = if id == "atlas" || id == "orchestrator" {
        let cfg = config::load().map_err(bad)?;
        let sink: tauri::ipc::Channel<dirs::AgentEvent> = tauri::ipc::Channel::new(|_| Ok(()));
        dirs::run_orchestrator(&cfg, vec![dirs::Msg { role: "user".into(), content: b.question }], &sink).await.map_err(bad)?.0
    } else {
        crate::agents::ask_once(&id, &b.question).await.map_err(bad)?
    };
    Ok(Json(json!({ "agent": id, "answer": answer })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewTask {
    kind: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    goal: String,
    #[serde(default)]
    input: tasks::TaskInput,
}

async fn create_task(State(c): State<Ctx>, h: HeaderMap, Json(b): Json<NewTask>) -> Res {
    authed(&c, &h)?;
    let title = if b.title.is_empty() { format!("{} (from n8n)", b.kind) } else { b.title };
    let id = tasks::task_create(c.app.clone(), b.kind, title, b.goal, b.input).map_err(bad)?;
    Ok(Json(json!({ "id": id, "status": "running" })))
}

async fn get_task(State(c): State<Ctx>, h: HeaderMap, Path(id): Path<String>) -> Res {
    authed(&c, &h)?;
    let t = tasks::tasks_list().map_err(bad)?.into_iter().find(|t| t.id == id).ok_or_else(|| err(StatusCode::NOT_FOUND, "no such task"))?;
    Ok(Json(serde_json::to_value(t).unwrap_or_default()))
}

#[derive(Deserialize)]
struct OppQuery {
    // Query strings are snake_case (?min_score=80); accept camelCase too.
    #[serde(default, alias = "minScore")]
    min_score: u8,
    #[serde(default)]
    status: Option<String>,
}

/// Returns a JSON array, which n8n turns into one item per opportunity.
async fn opportunities(State(c): State<Ctx>, h: HeaderMap, Query(q): Query<OppQuery>) -> Res {
    authed(&c, &h)?;
    let items: Vec<_> = inbox::opportunities_get().map_err(bad)?.items.into_iter()
        .filter(|o| o.score >= q.min_score && q.status.as_deref().is_none_or(|s| o.status == s))
        .collect();
    Ok(Json(serde_json::to_value(items).unwrap_or_default()))
}

async fn scan_inbox(State(c): State<Ctx>, h: HeaderMap) -> Res {
    authed(&c, &h)?;
    let r = inbox::inbox_scan(c.app.clone(), c.app.state::<inbox::Scanning>()).await.map_err(bad)?;
    Ok(Json(serde_json::to_value(r).unwrap_or_default()))
}

async fn create_approval(State(c): State<Ctx>, h: HeaderMap, Json(b): Json<approvals::Approval>) -> Res {
    authed(&c, &h)?;
    let a = approvals::create(&c.app, b).map_err(bad)?;
    Ok(Json(json!({ "id": a.id, "status": a.status, "flags": a.flags })))
}

#[derive(Deserialize)]
struct NewMission {
    title: String,
    brief: String,
    #[serde(default)]
    references: Vec<research::Reference>,
}

async fn create_mission(State(c): State<Ctx>, h: HeaderMap, Json(b): Json<NewMission>) -> Res {
    authed(&c, &h)?;
    let id = research::mission_create(b.title, b.brief, b.references).map_err(bad)?;
    research::mission_run(c.app.clone(), c.app.state::<research::Running>(), id.clone()).map_err(bad)?;
    Ok(Json(json!({ "id": id, "status": "running" })))
}

#[derive(Deserialize, serde::Serialize, Clone)]
struct Note {
    title: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    source: String,
}

/// A note from a workflow: shows as a toast and lands in the Flows inbox.
async fn notify(State(c): State<Ctx>, h: HeaderMap, Json(n): Json<Note>) -> Res {
    authed(&c, &h)?;
    crate::n8n::push_note(&n.title, &n.body, if n.source.is_empty() { "n8n" } else { &n.source }).map_err(bad)?;
    let _ = c.app.emit("atlas-notify", json!({ "title": n.title, "body": n.body }));
    Ok(Json(json!({ "ok": true })))
}

/// Writes where the API stands to ~/.config/atlas/api-status.json, so a failure to
/// start is visible in Settings instead of silent.
fn status(state: &str, detail: &str) {
    let _ = std::fs::write(config::config_path().with_file_name("api-status.json"),
        json!({ "state": state, "detail": detail, "at": chrono::Local::now().to_rfc3339() }).to_string());
}

pub fn token_path() -> std::path::PathBuf {
    config::config_path().with_file_name("api-token")
}

/// Starts the API in the background — nothing here may block app startup.
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move { serve(app).await });
}

async fn serve(app: AppHandle) {
    let cfg = match config::load() {
        Ok(c) => c,
        Err(e) => { status("error", &format!("config: {e}")); return; }
    };
    let token = std::fs::read_to_string(token_path()).map(|t| t.trim().to_string()).unwrap_or_default();
    if token.len() < 32 {
        status("error", "no API token at ~/.config/atlas/api-token");
        return;
    }
    let ctx = Ctx { app, token };
    let router = Router::new()
        .route("/v1/health", get(health))
        .route("/v1/today", get(today))
        .route("/v1/agents/{id}/ask", post(ask))
        .route("/v1/tasks", post(create_task))
        .route("/v1/tasks/{id}", get(get_task))
        .route("/v1/opportunities", get(opportunities))
        .route("/v1/inbox/scan", post(scan_inbox))
        .route("/v1/approvals", post(create_approval))
        .route("/v1/missions", post(create_mission))
        .route("/v1/notify", post(notify))
        .with_state(ctx);
    let port = cfg.api_port;
    match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(l) => {
            status("listening", &format!("127.0.0.1:{port}"));
            if let Err(e) = axum::serve(l, router).await { status("error", &format!("server stopped: {e}")); }
        }
        Err(e) => status("error", &format!("can't bind 127.0.0.1:{port}: {e}")),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn token_compare_is_exact() {
        assert!(super::same("abc123", "abc123"));
        assert!(!super::same("abc123", "abc124"));
        assert!(!super::same("abc", "abc123"));
    }
}
