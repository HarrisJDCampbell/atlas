//! Local agents on Ollama.
//!
//! An agent is a system prompt + a model + a list of projects whose live context
//! (README, open roadmap items, recent commits) is injected on every turn. Tokens
//! stream back to the UI over a Tauri Channel as Ollama produces them.

use crate::config::{self, AgentCfg, Config};
use crate::error::{Error, Result};
use crate::projects;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::State;

#[derive(Default)]
pub struct Inflight(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl Inflight {
    /// A cancel flag for a streaming request, flipped by `agent_cancel`.
    pub(crate) fn register(&self, id: &str) -> Arc<AtomicBool> {
        let c = Arc::new(AtomicBool::new(false));
        self.0.lock().unwrap().insert(id.to_string(), c.clone());
        c
    }
    pub(crate) fn remove(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatEvent {
    Thinking { text: String },
    Token { text: String },
    #[serde(rename_all = "camelCase")]
    Done { eval_count: u64, tokens_per_sec: f64, cancelled: bool },
}

#[derive(Deserialize)]
struct OllamaChunk {
    message: Option<OllamaMsg>,
    #[serde(default)]
    done: bool,
    eval_count: Option<u64>,
    eval_duration: Option<u64>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct OllamaMsg {
    #[serde(default)]
    content: String,
    #[serde(default)]
    thinking: String,
}

const README_BUDGET: usize = 6_000;

fn project_context(cfg: &Config, ids: &[String]) -> String {
    let mut out = String::new();
    for p in cfg.projects.iter().filter(|p| ids.contains(&p.id)) {
        let root = config::expand(&p.path);
        out.push_str(&format!("\n\n### Project: {} ({})\n", p.name, root.display()));
        if !p.tagline.is_empty() {
            out.push_str(&format!("{}\n", p.tagline));
        }
        // Not every repo has a README; agent guides describe the project just as well.
        let doc = ["README.md", "AGENTS.md", "CLAUDE.md"]
            .iter()
            .find_map(|f| std::fs::read_to_string(root.join(f)).ok().map(|t| (*f, t)));
        if let Some((name, text)) = doc {
            let cut: String = text.chars().take(README_BUDGET).collect();
            out.push_str(&format!("\n{name} (truncated):\n{cut}\n"));
        }
        if let Some(r) = projects::roadmap(&root, &p.roadmap) {
            out.push_str(&format!("\nRoadmap {} — {}/{} done:\n", r.file, r.done, r.total));
            for s in &r.sections {
                let next = s.next.as_deref().unwrap_or("(complete)");
                out.push_str(&format!("- {}: {}/{} · next: {}\n", s.title, s.done, s.total, next));
            }
        }
        let log = std::process::Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["log", "-12", "--format=%cs %s"])
            .output();
        if let Some(o) = log.ok().filter(|o| o.status.success()) {
            out.push_str(&format!("\nRecent commits:\n{}\n", String::from_utf8_lossy(&o.stdout)));
        }
    }
    out
}

fn system_prompt(cfg: &Config, agent: &AgentCfg) -> String {
    let today = chrono::Local::now().format("%A %Y-%m-%d %H:%M");
    // Who the agent works for comes from the profile, unless the prompt already says.
    let me = &cfg.profile;
    let system = if me.name.is_empty() || agent.system.contains(&me.name) {
        agent.system.clone()
    } else {
        format!("You work for {}, {}. Their priorities: {}.\n\n{}", me.who(), me.about, me.priorities, agent.system)
    };
    let mut ctx = project_context(cfg, &agent.context_projects);
    // Agents that see the class schedule also get today worked out for them.
    if agent.context_files.iter().any(|f| f.contains("courses")) {
        ctx.push_str(&format!("\n\n{}", crate::school::today_block(chrono::Local::now())));
    }
    for f in &agent.context_files {
        if let Ok(text) = std::fs::read_to_string(config::expand(f)) {
            ctx.push_str(&format!("\n\n### File: {f}\n{text}"));
        }
    }
    if ctx.is_empty() {
        format!("{system}\n\nToday is {today}.")
    } else {
        format!("{system}\n\nToday is {today}.\n\n## Live project context{ctx}")
    }
}

#[tauri::command]
pub async fn agent_chat(
    inflight: State<'_, Inflight>,
    request_id: String,
    agent_id: String,
    messages: Vec<ChatMsg>,
    think: Option<bool>,
    on_event: Channel<ChatEvent>,
) -> Result<()> {
    let cfg = config::load()?;
    let agent = cfg
        .agents
        .iter()
        .find(|a| a.id == agent_id)
        .ok_or_else(|| Error::msg(format!("unknown agent '{agent_id}'")))?
        .clone();

    let cancel = Arc::new(AtomicBool::new(false));
    inflight.0.lock().unwrap().insert(request_id.clone(), cancel.clone());

    let mut all = vec![ChatMsg { role: "system".into(), content: system_prompt(&cfg, &agent) }];
    all.extend(messages);

    let body = serde_json::json!({
        "model": agent.model,
        "messages": all,
        "stream": true,
        "think": think.unwrap_or(agent.think),
        "options": { "num_ctx": if agent.num_ctx > 0 { agent.num_ctx } else { 16384 } },
    });

    let result = stream(&cfg.ollama_url, body, &on_event, &cancel).await;
    inflight.0.lock().unwrap().remove(&request_id);
    result
}

pub(crate) async fn stream(
    base: &str,
    body: serde_json::Value,
    on_event: &Channel<ChatEvent>,
    cancel: &AtomicBool,
) -> Result<()> {
    let resp = reqwest::Client::new()
        .post(format!("{base}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| Error::msg(format!("Ollama unreachable at {base} — is it running? ({e})")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(Error::msg(format!("Ollama {status}: {text}")));
    }

    // Ollama streams NDJSON; a network chunk can hold several lines or half of one.
    let mut bytes = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = bytes.next().await {
        if cancel.load(Ordering::Relaxed) {
            let _ = on_event.send(ChatEvent::Done { eval_count: 0, tokens_per_sec: 0.0, cancelled: true });
            return Ok(()); // dropping the response closes the connection, which stops generation
        }
        buf.extend_from_slice(&chunk?);
        while let Some(nl) = buf.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = buf.drain(..=nl).collect();
            if line.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            let c: OllamaChunk = serde_json::from_slice(&line)?;
            if let Some(err) = c.error {
                return Err(Error::msg(err));
            }
            if let Some(m) = c.message {
                if !m.thinking.is_empty() {
                    let _ = on_event.send(ChatEvent::Thinking { text: m.thinking });
                }
                if !m.content.is_empty() {
                    let _ = on_event.send(ChatEvent::Token { text: m.content });
                }
            }
            if c.done {
                let n = c.eval_count.unwrap_or(0);
                let secs = c.eval_duration.unwrap_or(0) as f64 / 1e9;
                let tps = if secs > 0.0 { n as f64 / secs } else { 0.0 };
                let _ = on_event.send(ChatEvent::Done { eval_count: n, tokens_per_sec: tps, cancelled: false });
            }
        }
    }
    Ok(())
}

/// One question, one answer, no streaming — for workflows calling Atlas over HTTP.
pub async fn ask_once(agent_id: &str, question: &str) -> Result<String> {
    let cfg = config::load()?;
    let agent = cfg.agents.iter().find(|a| a.id == agent_id).ok_or_else(|| Error::msg(format!("unknown agent '{agent_id}'")))?.clone();
    let body = serde_json::json!({
        "model": agent.model, "stream": false, "think": false,
        "options": { "num_ctx": if agent.num_ctx > 0 { agent.num_ctx } else { 16384 } },
        "messages": [{"role": "system", "content": system_prompt(&cfg, &agent)}, {"role": "user", "content": question}],
    });
    let v: serde_json::Value = reqwest::Client::new().post(format!("{}/api/chat", cfg.ollama_url))
        .timeout(std::time::Duration::from_secs(600)).json(&body).send().await?.json().await?;
    v["message"]["content"].as_str().map(|s| s.trim().to_string()).ok_or_else(|| Error::msg(format!("Ollama: {}", v["error"])))
}

#[tauri::command]
pub fn agent_cancel(inflight: State<'_, Inflight>, request_id: String) {
    if let Some(flag) = inflight.0.lock().unwrap().get(&request_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    name: String,
    size_bytes: u64,
    remote: bool,
    loaded_vram_bytes: Option<u64>,
    expires_at: Option<String>,
}

/// Installed models plus what's resident in memory right now — the number that
/// decides whether Chrome and Spotify still feel fast.
#[tauri::command]
pub async fn ollama_models() -> Result<Vec<ModelInfo>> {
    let base = config::load()?.ollama_url;
    let client = reqwest::Client::new();
    let tags: serde_json::Value = client.get(format!("{base}/api/tags")).send().await?.json().await?;
    let ps: serde_json::Value = client.get(format!("{base}/api/ps")).send().await?.json().await?;

    let loaded: HashMap<String, (u64, String)> = ps["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| {
            let size = m["size_vram"].as_u64().or_else(|| m["size"].as_u64())?;
            Some((m["name"].as_str()?.to_string(), (size, m["expires_at"].as_str().unwrap_or("").to_string())))
        })
        .collect();

    Ok(tags["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| {
            let name = m["name"].as_str()?.to_string();
            let l = loaded.get(&name);
            Some(ModelInfo {
                remote: m["remote_host"].is_string() || name.ends_with("-cloud"),
                size_bytes: m["size"].as_u64().unwrap_or(0),
                loaded_vram_bytes: l.map(|(s, _)| *s),
                expires_at: l.map(|(_, e)| e.clone()),
                name,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    // Needs a running Ollama with qwen3:8b: cargo test -- --ignored
    #[tokio::test]
    #[ignore]
    async fn streams_tokens_from_ollama() {
        let got = Arc::new(StdMutex::new(Vec::<String>::new()));
        let sink = got.clone();
        let ch: Channel<ChatEvent> = Channel::new(move |body| {
            if let tauri::ipc::InvokeResponseBody::Json(j) = body {
                sink.lock().unwrap().push(j);
            }
            Ok(())
        });
        let body = serde_json::json!({
            "model": "qwen3:8b", "stream": true, "think": false,
            "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        });
        stream("http://127.0.0.1:11434", body, &ch, &AtomicBool::new(false)).await.unwrap();
        let events = got.lock().unwrap();
        assert!(events.iter().any(|e| e.contains("\"type\":\"token\"")), "{events:?}");
        assert!(events.last().unwrap().contains("\"type\":\"done\""), "{events:?}");
    }

    #[test]
    fn context_includes_roadmap_and_commits() {
        // The repo this test was compiled from, wherever it's checked out.
        let mut cfg = crate::defaults::config();
        cfg.projects[0].path = concat!(env!("CARGO_MANIFEST_DIR"), "/..").into();
        let ctx = project_context(&cfg, &["atlas".to_string()]);
        assert!(ctx.contains("Project: Atlas"));
        assert!(ctx.contains("Roadmap ROADMAP.md"), "{ctx}");
    }
}

#[cfg(test)]
mod budget {
    #[test]
    #[ignore]
    fn print_prompt_sizes() {
        let cfg = crate::defaults::config();
        for a in &cfg.agents {
            let n = super::system_prompt(&cfg, a).chars().count();
            println!("{:<18} {:>6} chars ≈ {:>5} tokens / ctx {}", a.name, n, n / 4, a.num_ctx);
        }
    }
}
