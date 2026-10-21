//! Missions: describe a goal, attach references, and a swarm of local agents
//! researches it on the web.
//!
//!   references ─► planner ─► N researchers (web_search / fetch_page tools)
//!                                  │ findings = {claim, exact quote, url}
//!                                  ▼
//!                           verifier (Rust, not a model): the quote must appear
//!                           verbatim in the page text we actually fetched
//!                                  ▼
//!                           writer: report from verified findings only
//!
//! Local models invent sources. The verifier is what makes their output usable:
//! a finding whose quote isn't on the page never reaches the report.

use crate::config;
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

// ─────────────────────────────────────────────────────────────── storage ──

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Reference {
    /// "url" | "video" | "note"
    pub kind: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Mission {
    pub id: String,
    pub title: String,
    pub brief: String,
    pub references: Vec<Reference>,
    pub created: String,
    /// draft | running | done | failed | cancelled
    pub status: String,
    pub model: String,
    pub finished: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Source {
    pub n: usize,
    pub url: String,
    pub title: String,
    pub primary: bool,
    pub chars: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Finding {
    pub question: String,
    pub claim: String,
    pub quote: String,
    pub url: String,
    pub source: Option<usize>,
    pub verified: bool,
}

fn root() -> PathBuf {
    config::config_path().with_file_name("missions")
}

fn dir(id: &str) -> Result<PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(Error::msg("bad mission id"));
    }
    Ok(root().join(id))
}

fn read_json<T: for<'de> Deserialize<'de>>(p: &Path) -> Option<T> {
    serde_json::from_str(&std::fs::read_to_string(p).ok()?).ok()
}

fn write_json<T: Serialize>(p: &Path, v: &T) -> Result<()> {
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(v)?)?;
    std::fs::rename(tmp, p)?;
    Ok(())
}

fn slug(title: &str) -> String {
    let s: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).take(6).collect::<Vec<_>>().join("-");
    let short = &uuid::Uuid::new_v4().simple().to_string()[..6];
    format!("{}-{short}", if s.is_empty() { "mission" } else { &s })
}

// ──────────────────────────────────────────────────────────────── events ──

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    Phase { phase: String, detail: String },
    Agent { agent: String, status: String, detail: String },
    Source { n: usize, url: String, title: String, primary: bool },
    Finding { agent: String, claim: String, verified: bool },
    Log { text: String },
    Done { verified: usize, total: usize, sources: usize },
    Error { message: String },
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    mission_id: String,
    at: String,
    event: Event,
}

/// Shared state for one run: emits to the UI, appends to run.jsonl, holds the page cache.
type Sink = Arc<dyn Fn(Envelope) + Send + Sync>;

struct Run {
    sink: Sink,
    id: String,
    dir: PathBuf,
    model: String,
    ollama: String,
    search_url: String,
    cancel: Arc<AtomicBool>,
    pages: Mutex<HashMap<String, (usize, String)>>, // url → (source n, full text)
    sources: Mutex<Vec<Source>>,
    http: reqwest::Client,
}

impl Run {
    fn emit(&self, event: Event) {
        let env = Envelope { mission_id: self.id.clone(), at: chrono::Local::now().to_rfc3339(), event };
        if let Ok(line) = serde_json::to_string(&env) {
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(self.dir.join("run.jsonl")) {
                let _ = writeln!(f, "{line}");
            }
        }
        (self.sink)(env);
    }

    fn cancelled(&self) -> Result<()> {
        if self.cancel.load(Ordering::Relaxed) {
            return Err(Error::msg("cancelled"));
        }
        Ok(())
    }

    fn add_source(&self, url: &str, title: &str, text: String) -> usize {
        let mut pages = self.pages.lock().unwrap();
        if let Some((n, _)) = pages.get(url) {
            return *n;
        }
        let mut sources = self.sources.lock().unwrap();
        let n = sources.len() + 1;
        let primary = is_primary(url);
        let _ = std::fs::write(self.dir.join(format!("sources/{n}.txt")), &text);
        sources.push(Source { n, url: url.into(), title: title.into(), primary, chars: text.chars().count() });
        let _ = write_json(&self.dir.join("sources.json"), &*sources);
        pages.insert(url.to_string(), (n, text));
        drop(sources);
        drop(pages);
        self.emit(Event::Source { n, url: url.into(), title: title.into(), primary });
        n
    }
}

// ───────────────────────────────────────────────────────────────── tools ──

/// Government, education and court sites. Agents are told to prefer them.
fn is_primary(url: &str) -> bool {
    let host = url.split("://").nth(1).and_then(|r| r.split('/').next()).unwrap_or("").to_lowercase();
    host.ends_with(".gov") || host.ends_with(".edu") || host.ends_with(".ca.gov") || host.contains("leginfo")
        || host.contains("courtlistener") || host.ends_with(".uscourts.gov") || host.contains("law.cornell.edu")
}

fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push_str("\n…[truncated]");
    out
}

/// Returns the text for the model plus the result URLs, so the orchestrator can
/// read pages itself when the model doesn't.
async fn web_search(run: &Run, query: &str) -> (String, Vec<String>) {
    let url = format!("{}/search", run.search_url.trim_end_matches('/'));
    let res = run.http.get(url).query(&[("q", query), ("format", "json")]).send().await;
    let Ok(resp) = res else {
        return ("Search is offline. Is the SearXNG container running (Docker)?".into(), vec![]);
    };
    let Ok(v) = resp.json::<Value>().await else { return ("Search returned no readable results.".into(), vec![]) };
    let mut lines = Vec::new();
    let mut urls = Vec::new();
    for r in v["results"].as_array().into_iter().flatten().take(10) {
        let u = r["url"].as_str().unwrap_or("");
        urls.push(u.to_string());
        let tag = if is_primary(u) { " [primary]" } else { "" };
        lines.push(format!(
            "- {}{tag}\n  {u}\n  {}",
            r["title"].as_str().unwrap_or(""),
            clip(r["content"].as_str().unwrap_or(""), 240)
        ));
    }
    (if lines.is_empty() { "No results.".into() } else { lines.join("\n") }, urls)
}

async fn fetch_text(http: &reqwest::Client, url: &str) -> std::result::Result<(String, String), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) URLs".into());
    }
    let resp = http.get(url).send().await.map_err(|e| format!("fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let ctype = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_lowercase();
    if ctype.contains("pdf") {
        return Err("PDFs aren't supported yet".into());
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let bytes = &bytes[..bytes.len().min(3_000_000)];
    let raw = String::from_utf8_lossy(bytes).to_string();
    let title = raw
        .find("<title")
        .and_then(|i| raw[i..].find('>').map(|j| i + j + 1))
        .and_then(|s| raw[s..].find("</title>").map(|e| raw[s..s + e].trim().to_string()))
        .unwrap_or_else(|| url.to_string());
    let text = if ctype.contains("html") || raw.trim_start().starts_with('<') {
        html2text::from_read(bytes, 120).unwrap_or(raw)
    } else {
        raw
    };
    // Drop link-reference noise html2text leaves at the bottom.
    let text: String = text.lines().filter(|l| !l.trim_start().starts_with("[")).collect::<Vec<_>>().join("\n");
    Ok((html_unescape(&title), text))
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">")
}

async fn fetch_page(run: &Run, url: &str) -> String {
    if let Some((n, text)) = run.pages.lock().unwrap().get(url) {
        return format!("[source {n}] {url}\n{}", clip(text, 5000));
    }
    match fetch_text(&run.http, url).await {
        Ok((title, text)) => {
            let n = run.add_source(url, &title, text.clone());
            format!("[source {n}] {title}\n{url}\n\n{}", clip(&text, 5000))
        }
        Err(e) => format!("Could not fetch {url}: {e}"),
    }
}

/// Captions via yt-dlp (YouTube, and TikTok/Instagram when they carry subtitles).
async fn video_transcript(run: &Run, url: &str) -> std::result::Result<(String, String), String> {
    let tmp = run.dir.join("video");
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let out = tokio::process::Command::new(crate::launch::find_bin("yt-dlp"))
        .args(["--skip-download", "--no-simulate", "--write-subs", "--write-auto-subs", "--sub-langs", "en.*,en", "--sub-format", "vtt", "--print", "title", "-o"])
        .arg(tmp.join("%(id)s.%(ext)s"))
        .arg(url)
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| format!("yt-dlp not available: {e}"))?;
    let title = String::from_utf8_lossy(&out.stdout).lines().next().unwrap_or(url).to_string();
    let vtt = std::fs::read_dir(&tmp)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|x| x == "vtt"))
        .ok_or_else(|| "no captions on this video (a local Whisper pass would be needed)".to_string())?;
    let raw = std::fs::read_to_string(&vtt).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&tmp);
    Ok((title, vtt_to_text(&raw)))
}

/// Auto-captions repeat each line as it scrolls; keep each line once.
pub fn vtt_to_text(vtt: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for line in vtt.lines() {
        let l = line.trim();
        if l.is_empty() || l == "WEBVTT" || l.contains("-->") || l.starts_with("Kind:") || l.starts_with("Language:") || l.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let mut clean = String::new();
        let mut in_tag = false;
        for c in l.chars() {
            match c {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => clean.push(c),
                _ => {}
            }
        }
        let clean = clean.trim().to_string();
        if !clean.is_empty() && out.last() != Some(&clean) {
            out.push(clean);
        }
    }
    out.join(" ")
}

// ─────────────────────────────────────────────────────────────── ollama ──

fn tools_schema() -> Value {
    json!([
        {"type": "function", "function": {
            "name": "web_search",
            "description": "Search the web. Returns up to 10 results with title, URL and snippet. Results marked [primary] are government, court or university sites.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
        {"type": "function", "function": {
            "name": "fetch_page",
            "description": "Fetch a web page and return its text. Only quotes from pages you fetched can be cited.",
            "parameters": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}}}
    ])
}

async fn chat(run: &Run, messages: &[Value], tools: Option<&Value>, format: Option<&Value>, num_ctx: u32) -> Result<Value> {
    run.cancelled()?;
    let mut body = json!({
        "model": run.model, "messages": messages, "stream": false, "think": false,
        "options": {"num_ctx": num_ctx, "temperature": 0.3},
    });
    if let Some(t) = tools {
        body["tools"] = t.clone();
    }
    if let Some(f) = format {
        body["format"] = f.clone();
    }
    let resp = run
        .http
        .post(format!("{}/api/chat", run.ollama))
        .timeout(Duration::from_secs(600))
        .json(&body)
        .send()
        .await
        .map_err(|e| Error::msg(format!("Ollama unreachable: {e}")))?;
    let status = resp.status();
    let v: Value = resp.json().await?;
    if !status.is_success() {
        return Err(Error::msg(format!("Ollama {status}: {}", v["error"].as_str().unwrap_or(""))));
    }
    Ok(v["message"].clone())
}

async fn structured<T: for<'de> Deserialize<'de>>(run: &Run, messages: &[Value], schema: Value, num_ctx: u32) -> Result<T> {
    let msg = chat(run, messages, None, Some(&schema), num_ctx).await?;
    let content = msg["content"].as_str().unwrap_or("");
    serde_json::from_str(content).map_err(|e| Error::msg(format!("model returned malformed JSON: {e}")))
}

// ─────────────────────────────────────────────────────────────── phases ──

#[derive(Deserialize)]
struct Plan {
    questions: Vec<String>,
}

#[derive(Deserialize)]
struct RawFindings {
    findings: Vec<RawFinding>,
}

#[derive(Deserialize)]
struct RawFinding {
    claim: String,
    quote: String,
    url: String,
}

const RESEARCHER: &str = "You are a careful research agent. Answer the question by searching the web and \
fetching pages. Prefer [primary] sources (government, courts, universities) over blogs and marketing sites, \
and note when a source is selling something. Fetch at least two pages before you stop. When you have enough, \
reply with a short plain-text summary of what you found. Never state anything you did not read on a fetched page.";

const MIN_PAGES: usize = 2;

async fn research(run: &Run, agent: String, question: String, context: &str) -> Result<Vec<Finding>> {
    run.emit(Event::Agent { agent: agent.clone(), status: "searching".into(), detail: question.clone() });
    let tools = tools_schema();
    let mut messages = vec![
        json!({"role": "system", "content": RESEARCHER}),
        json!({"role": "user", "content": format!("Mission context:\n{context}\n\nYour question: {question}")}),
    ];
    let mut seen: Vec<String> = Vec::new(); // result URLs from this agent's searches
    let mut read: Vec<String> = Vec::new(); // pages this agent actually fetched

    for _step in 0..7 {
        let msg = chat(run, &messages, Some(&tools), None, 16384).await?;
        let calls = msg["tool_calls"].as_array().cloned().unwrap_or_default();
        messages.push(msg.clone());
        if calls.is_empty() {
            break;
        }
        for call in calls {
            let name = call["function"]["name"].as_str().unwrap_or("");
            let args = &call["function"]["arguments"];
            let (detail, out) = match name {
                "web_search" => {
                    let q = args["query"].as_str().unwrap_or("").to_string();
                    let (text, urls) = web_search(run, &q).await;
                    seen.extend(urls);
                    (format!("search: {q}"), text)
                }
                "fetch_page" => {
                    let u = args["url"].as_str().unwrap_or("").to_string();
                    let out = fetch_page(run, &u).await;
                    if out.starts_with("[source") {
                        read.push(u.clone());
                    }
                    (format!("read: {u}"), out)
                }
                other => (format!("unknown tool {other}"), format!("No tool named {other}.")),
            };
            run.emit(Event::Agent { agent: agent.clone(), status: "working".into(), detail });
            messages.push(json!({"role": "tool", "tool_name": name, "content": out}));
        }
    }

    // Small models often stop after one search and "cite" snippets. Don't rely on
    // the model's discipline: if it read too little, read the best results for it.
    if read.len() < MIN_PAGES {
        if seen.is_empty() {
            let (_, urls) = web_search(run, &question).await;
            seen = urls;
        }
        seen.sort_by_key(|u| !is_primary(u)); // primary sources first, otherwise search order
        seen.dedup();
        for u in seen.iter().filter(|u| !read.contains(u)).cloned().collect::<Vec<_>>() {
            if read.len() > MIN_PAGES {
                break;
            }
            run.emit(Event::Agent { agent: agent.clone(), status: "working".into(), detail: format!("auto-read: {u}") });
            if fetch_page(run, &u).await.starts_with("[source") {
                read.push(u);
            }
        }
    }

    // Cite only from text it can actually quote, labelled with the URL to cite.
    let library: String = {
        let pages = run.pages.lock().unwrap();
        read.iter()
            .filter_map(|u| pages.get(u).map(|(n, t)| format!("=== URL: {u} [source {n}]\n{}", clip(t, 3500))))
            .collect::<Vec<_>>()
            .join("\n\n")
    };
    if library.is_empty() {
        run.emit(Event::Agent { agent: agent.clone(), status: "failed".into(), detail: "could not read any pages".into() });
        return Ok(vec![]);
    }

    run.emit(Event::Agent { agent: agent.clone(), status: "citing".into(), detail: format!("{} pages read", read.len()) });
    let cite = vec![
        json!({"role": "system", "content": "You extract evidence. You may only use the pages below. Copy quotes \
            character-for-character from a page; never paraphrase inside a quote. Use the exact URL from the page's \
            === URL line."}),
        json!({"role": "user", "content": format!("Question: {question}\n\nPages:\n{library}\n\nGive 2-6 findings that \
            answer the question. Each: a one-sentence claim in your words, a quote of 10-40 words copied exactly \
            from one page, and that page's URL.")}),
    ];
    let schema = json!({"type": "object", "properties": {"findings": {"type": "array", "items": {"type": "object",
        "properties": {"claim": {"type": "string"}, "quote": {"type": "string"}, "url": {"type": "string"}},
        "required": ["claim", "quote", "url"]}}}, "required": ["findings"]});
    let raw: RawFindings = structured(run, &cite, schema, 16384).await?;

    let mut out = Vec::new();
    for f in raw.findings {
        let (source, verified) = verify(run, &f.url, &f.quote);
        run.emit(Event::Finding { agent: agent.clone(), claim: f.claim.clone(), verified });
        out.push(Finding { question: question.clone(), claim: f.claim, quote: f.quote, url: f.url, source, verified });
    }
    let ok = out.iter().filter(|f| f.verified).count();
    run.emit(Event::Agent { agent, status: "done".into(), detail: format!("{ok}/{} findings verified · {} pages read", out.len(), read.len()) });
    Ok(out)
}

/// Lowercase, unify quotes/dashes, collapse whitespace — so formatting differences
/// between the fetched text and the model's copy don't fail an honest quote.
pub fn normalize(s: &str) -> String {
    let mapped: String = s
        .chars()
        .map(|c| match c {
            '\u{2018}' | '\u{2019}' | '`' => '\'',
            '\u{201c}' | '\u{201d}' => '"',
            '\u{2013}' | '\u{2014}' => '-',
            c if c.is_whitespace() => ' ',
            c => c.to_ascii_lowercase(),
        })
        .collect();
    mapped.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A finding is verified only if its quote is on the page we fetched — checked here, not by a model.
pub fn quote_on_page(page: &str, quote: &str) -> bool {
    // Normalize before trimming, so curly quotes become straight ones and get stripped too.
    let q = normalize(quote).replace("...", "…");
    let page = normalize(page);
    // An elided quote ("A … B") passes only if every piece is on the page, in order.
    let parts: Vec<&str> = q
        .split('…')
        .map(|p| p.trim_matches(|c: char| c == '"' || c == '\'' || c == ' ' || c == '.' || c == ',').trim())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.iter().map(|p| p.len()).sum::<usize>() < 25 || parts.iter().any(|p| p.len() < 12) {
        return false;
    }
    let mut from = 0;
    for p in parts {
        match page[from..].find(p) {
            Some(i) => from += i + p.len(),
            None => return false,
        }
    }
    true
}

fn verify(run: &Run, url: &str, quote: &str) -> (Option<usize>, bool) {
    let pages = run.pages.lock().unwrap();
    let hit = pages.get(url).or_else(|| pages.iter().find(|(u, _)| u.trim_end_matches('/') == url.trim_end_matches('/')).map(|(_, v)| v));
    match hit {
        Some((n, text)) => (Some(*n), quote_on_page(text, quote)),
        None => (None, false),
    }
}

async fn prepare_references(run: &Run, m: &Mission) -> String {
    let mut digest = String::new();
    for r in &m.references {
        let v = r.value.trim();
        match r.kind.as_str() {
            "note" => digest.push_str(&format!("\n\nNote from the person who asked:\n{v}")),
            "video" => {
                run.emit(Event::Log { text: format!("Pulling transcript: {v}") });
                match video_transcript(run, v).await {
                    Ok((title, text)) => {
                        let n = run.add_source(v, &format!("Video: {title}"), text.clone());
                        digest.push_str(&format!("\n\nReference video [source {n}] \"{title}\" transcript:\n{}", clip(&text, 6000)));
                    }
                    Err(e) => run.emit(Event::Log { text: format!("Transcript unavailable for {v}: {e}") }),
                }
            }
            _ => {
                run.emit(Event::Log { text: format!("Reading reference: {v}") });
                match fetch_text(&run.http, v).await {
                    Ok((title, text)) => {
                        let n = run.add_source(v, &title, text.clone());
                        digest.push_str(&format!("\n\nReference page [source {n}] {title}:\n{}", clip(&text, 4000)));
                    }
                    Err(e) => run.emit(Event::Log { text: format!("Could not read {v}: {e}") }),
                }
            }
        }
    }
    digest
}

const WRITER: &str = "You write research briefs for someone deciding whether to act on an idea. \
Use ONLY the verified findings provided, and cite them inline as [n] using their source numbers. Be direct: \
lead with the answer, then the evidence, then risks, then concrete next steps. Do not add facts that are not in \
the findings. Write in Markdown with short ## sections, no emoji, and do not repeat the title as a heading. \
If the findings don't answer part of the brief, say so plainly under \"Not answered\" instead of filling the gap.";

async fn run_mission(run: Arc<Run>, mut m: Mission) -> Result<(usize, usize)> {
    run.emit(Event::Phase { phase: "references".into(), detail: format!("{} reference(s)", m.references.len()) });
    let refs = prepare_references(&run, &m).await;
    let context = format!("Title: {}\nBrief: {}{}", m.title, m.brief, clip(&refs, 9000));

    run.emit(Event::Phase { phase: "plan".into(), detail: "breaking the mission into research questions".into() });
    let plan: Plan = structured(
        &run,
        &[
            json!({"role": "system", "content": "You plan web research. Split the mission into 3 to 5 specific, \
                searchable research questions that together answer whether and how to do it, including legal, \
                cost and risk questions where relevant. No overlap between questions."}),
            json!({"role": "user", "content": context}),
        ],
        json!({"type": "object", "properties": {"questions": {"type": "array", "items": {"type": "string"}}}, "required": ["questions"]}),
        16384,
    )
    .await?;
    let questions: Vec<String> = plan.questions.into_iter().filter(|q| !q.trim().is_empty()).take(5).collect();
    for (i, q) in questions.iter().enumerate() {
        run.emit(Event::Agent { agent: format!("R{}", i + 1), status: "queued".into(), detail: q.clone() });
    }

    run.emit(Event::Phase { phase: "research".into(), detail: format!("{} agents", questions.len()) });
    // Three at a time: Ollama queues beyond its parallel slots anyway, and each
    // slot's context costs memory.
    let sem = Arc::new(tokio::sync::Semaphore::new(3));
    let mut handles = Vec::new();
    for (i, q) in questions.iter().cloned().enumerate() {
        let run = run.clone();
        let sem = sem.clone();
        let ctx = context.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire_owned().await.ok()?;
            let agent = format!("R{}", i + 1);
            match research(&run, agent.clone(), q, &ctx).await {
                Ok(f) => Some(f),
                Err(e) => {
                    run.emit(Event::Agent { agent, status: "failed".into(), detail: e.to_string() });
                    None
                }
            }
        }));
    }
    let mut findings: Vec<Finding> = Vec::new();
    for h in handles {
        if let Ok(Some(f)) = h.await {
            findings.extend(f);
        }
    }
    run.cancelled()?;
    write_json(&run.dir.join("findings.json"), &findings)?;

    let verified: Vec<&Finding> = findings.iter().filter(|f| f.verified).collect();
    run.emit(Event::Phase { phase: "verify".into(), detail: format!("{} of {} findings verified against fetched pages", verified.len(), findings.len()) });

    run.emit(Event::Phase { phase: "write".into(), detail: "writing the brief from verified findings".into() });
    let sources = run.sources.lock().unwrap().clone();
    let evidence: String = verified
        .iter()
        .map(|f| {
            let src = f.source.and_then(|n| sources.iter().find(|s| s.n == n));
            format!("- [{}] {} — quote: \"{}\" ({}{})", f.source.unwrap_or(0), f.claim, f.quote,
                src.map(|s| s.title.as_str()).unwrap_or(""), if src.is_some_and(|s| s.primary) { ", primary source" } else { "" })
        })
        .collect::<Vec<_>>()
        .join("\n");
    let body = if verified.is_empty() {
        "No finding survived verification, so there is nothing reliable to report. Try a narrower brief, or check that search is running.".to_string()
    } else {
        let msg = chat(
            &run,
            &[
                json!({"role": "system", "content": WRITER}),
                json!({"role": "user", "content": format!("{context}\n\nVerified findings:\n{evidence}")}),
            ],
            None,
            None,
            24576,
        )
        .await?;
        let text = msg["content"].as_str().unwrap_or("").trim();
        // The report already has the mission title as its H1.
        text.lines().skip_while(|l| l.starts_with("# ")).collect::<Vec<_>>().join("\n").trim().to_string()
    };

    let unverified: Vec<&Finding> = findings.iter().filter(|f| !f.verified).collect();
    let mut report = format!("# {}\n\n{}\n", m.title, body);
    if !unverified.is_empty() {
        report.push_str("\n## Claims that failed verification\n\nThe agents asserted these, but the quote was not on the page they cited, so they were kept out of the brief above:\n\n");
        for f in &unverified {
            report.push_str(&format!("- {} ({})\n", f.claim, f.url));
        }
    }
    report.push_str("\n## Sources\n\n");
    for s in &sources {
        report.push_str(&format!("{}. {}{} — {}\n", s.n, s.title, if s.primary { " (primary)" } else { "" }, s.url));
    }
    std::fs::write(run.dir.join("report.md"), &report)?;

    m.status = "done".into();
    m.finished = Some(chrono::Local::now().to_rfc3339());
    write_json(&run.dir.join("mission.json"), &m)?;
    Ok((verified.len(), findings.len()))
}

// ───────────────────────────────────────────────────────────── commands ──

#[derive(Default)]
pub struct Running(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionSummary {
    mission: Mission,
    sources: usize,
    verified: usize,
    findings: usize,
}

fn load_mission(id: &str, running: &Running) -> Option<Mission> {
    let mut m: Mission = read_json(&dir(id).ok()?.join("mission.json"))?;
    // A run that died with the app is not still running.
    if m.status == "running" && !running.0.lock().unwrap().contains_key(id) {
        m.status = "interrupted".into();
    }
    Some(m)
}

#[tauri::command]
pub fn missions_list(running: State<'_, Running>) -> Result<Vec<MissionSummary>> {
    list(&running)
}

pub fn list(running: &Running) -> Result<Vec<MissionSummary>> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(root()).into_iter().flatten().flatten() {
        let id = e.file_name().to_string_lossy().to_string();
        let Some(m) = load_mission(&id, running) else { continue };
        let findings: Vec<Finding> = read_json(&e.path().join("findings.json")).unwrap_or_default();
        let sources: Vec<Source> = read_json(&e.path().join("sources.json")).unwrap_or_default();
        out.push(MissionSummary { verified: findings.iter().filter(|f| f.verified).count(), findings: findings.len(), sources: sources.len(), mission: m });
    }
    out.sort_by(|a, b| b.mission.created.cmp(&a.mission.created));
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionDetail {
    mission: Mission,
    report: Option<String>,
    findings: Vec<Finding>,
    sources: Vec<Source>,
    events: Vec<Value>,
}

#[tauri::command]
pub fn mission_get(running: State<'_, Running>, id: String) -> Result<MissionDetail> {
    get(&running, &id)
}

pub fn get(running: &Running, id: &str) -> Result<MissionDetail> {
    let d = dir(id)?;
    let mission = load_mission(id, running).ok_or_else(|| Error::msg("mission not found"))?;
    let events = std::fs::read_to_string(d.join("run.jsonl"))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    Ok(MissionDetail {
        mission,
        report: std::fs::read_to_string(d.join("report.md")).ok(),
        findings: read_json(&d.join("findings.json")).unwrap_or_default(),
        sources: read_json(&d.join("sources.json")).unwrap_or_default(),
        events,
    })
}

#[tauri::command]
pub fn mission_create(title: String, brief: String, references: Vec<Reference>) -> Result<String> {
    if title.trim().is_empty() || brief.trim().is_empty() {
        return Err(Error::msg("a mission needs a title and a brief"));
    }
    let id = slug(&title);
    let d = dir(&id)?;
    std::fs::create_dir_all(d.join("sources"))?;
    let model = config::load()?.research_model;
    let m = Mission {
        id: id.clone(),
        title: title.trim().into(),
        brief: brief.trim().into(),
        references: references.into_iter().filter(|r| !r.value.trim().is_empty()).collect(),
        created: chrono::Local::now().to_rfc3339(),
        status: "draft".into(),
        model,
        finished: None,
    };
    write_json(&d.join("mission.json"), &m)?;
    Ok(id)
}

/// Prepares a fresh run of mission `id` and returns the future that executes it.
fn start(id: &str, cancel: Arc<AtomicBool>, sink: Sink) -> Result<impl std::future::Future<Output = ()> + use<>> {
    let d = dir(id)?;
    let mut m: Mission = read_json(&d.join("mission.json")).ok_or_else(|| Error::msg("mission not found"))?;
    // Fresh run: clear the previous run's artifacts, keep the mission itself.
    for f in ["run.jsonl", "findings.json", "sources.json", "report.md"] {
        let _ = std::fs::remove_file(d.join(f));
    }
    let _ = std::fs::remove_dir_all(d.join("sources"));
    std::fs::create_dir_all(d.join("sources"))?;

    let cfg = config::load()?;
    m.status = "running".into();
    m.model = cfg.research_model.clone();
    m.finished = None;
    write_json(&d.join("mission.json"), &m)?;

    let run = Arc::new(Run {
        sink,
        id: id.to_string(),
        dir: d,
        model: cfg.research_model,
        ollama: cfg.ollama_url,
        search_url: cfg.search_url,
        cancel,
        pages: Mutex::new(HashMap::new()),
        sources: Mutex::new(Vec::new()),
        http: reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AtlasResearch/0.3")
            .build()?,
    });

    Ok(async move {
        match run_mission(run.clone(), m.clone()).await {
            Ok((verified, total)) => {
                let sources = run.sources.lock().unwrap().len();
                run.emit(Event::Done { verified, total, sources });
            }
            Err(e) => {
                let cancelled = run.cancel.load(Ordering::Relaxed);
                m.status = if cancelled { "cancelled".into() } else { "failed".into() };
                m.finished = Some(chrono::Local::now().to_rfc3339());
                let _ = write_json(&run.dir.join("mission.json"), &m);
                run.emit(Event::Error { message: if cancelled { "Cancelled.".into() } else { e.to_string() } });
            }
        }
    })
}

#[tauri::command]
pub fn mission_run(app: AppHandle, running: State<'_, Running>, id: String) -> Result<()> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut r = running.0.lock().unwrap();
        if r.contains_key(&id) {
            return Err(Error::msg("already running"));
        }
        r.insert(id.clone(), cancel.clone());
    }
    let emitter = app.clone();
    let sink: Sink = Arc::new(move |env| {
        let _ = emitter.emit("mission-event", env);
    });
    let fut = match start(&id, cancel, sink) {
        Ok(f) => f,
        Err(e) => {
            running.0.lock().unwrap().remove(&id);
            return Err(e);
        }
    };
    tauri::async_runtime::spawn(async move {
        fut.await;
        if let Some(state) = app.try_state::<Running>() {
            state.0.lock().unwrap().remove(&id);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn mission_cancel(running: State<'_, Running>, id: String) {
    if let Some(flag) = running.0.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Moves a mission to missions/.trash rather than deleting it.
#[tauri::command]
pub fn mission_delete(running: State<'_, Running>, id: String) -> Result<()> {
    if running.0.lock().unwrap().contains_key(&id) {
        return Err(Error::msg("stop the mission first"));
    }
    let trash = root().join(".trash");
    std::fs::create_dir_all(&trash)?;
    std::fs::rename(dir(&id)?, trash.join(&id))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end on real hardware: needs Ollama + SearXNG.
    ///   ATLAS_MISSION="title|brief" cargo test live_mission -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_mission() {
        let spec = std::env::var("ATLAS_MISSION").expect("set ATLAS_MISSION=title|brief");
        let (title, brief) = spec.split_once('|').expect("title|brief");
        let refs = std::env::var("ATLAS_REFS").unwrap_or_default();
        let references = refs.split_whitespace().map(|u| Reference {
            kind: if u.contains("youtube") || u.contains("youtu.be") || u.contains("tiktok") { "video".into() } else { "url".into() },
            value: u.into(),
        }).collect();
        let id = mission_create(title.into(), brief.into(), references).unwrap();
        println!("mission {id}");
        let sink: Sink = Arc::new(|env: Envelope| {
            let line = match &env.event {
                Event::Phase { phase, detail } => format!("== {phase}: {detail}"),
                Event::Agent { agent, status, detail } => format!("   {agent} {status}: {}", clip(detail, 110)),
                Event::Source { n, title, primary, .. } => format!("   + source {n}{} {}", if *primary { " [primary]" } else { "" }, clip(title, 80)),
                Event::Finding { agent, claim, verified } => format!("   {} {agent} {}", if *verified { "✓" } else { "✗" }, clip(claim, 100)),
                Event::Log { text } => format!("   · {text}"),
                Event::Done { verified, total, sources } => format!("== done: {verified}/{total} verified, {sources} sources"),
                Event::Error { message } => format!("!! {message}"),
            };
            println!("[{}] {line}", &env.at[11..19]);
        });
        start(&id, Arc::new(AtomicBool::new(false)), sink).unwrap().await;
    }

    #[test]
    fn verifies_quotes_despite_formatting() {
        let page = "Under California law, a real estate license is required for anyone who, for compensation,\n  \
                    sells or offers to sell real property on behalf of another — see B&P §10131.";
        assert!(quote_on_page(page, "\u{201c}a real estate license is required for anyone who, for compensation, sells or offers to sell\u{201d}"));
        assert!(!quote_on_page(page, "a real estate license is never required for wholesalers in California"));
        assert!(!quote_on_page(page, "license is required"), "too short to be evidence");
        assert!(quote_on_page(page, "a real estate license is required for anyone who … sells or offers to sell real property"));
        assert!(!quote_on_page(page, "sells or offers to sell real property … a real estate license is required"), "pieces out of order");
    }

    #[test]
    fn vtt_dedupes_scrolling_captions() {
        let vtt = "WEBVTT\nKind: captions\n\n00:00.000 --> 00:01.000\nfind a seller<00:00.500><c> at sixty</c>\n\n00:01.000 --> 00:02.000\nfind a seller at sixty\nand a buyer at eighty\n";
        assert_eq!(vtt_to_text(vtt), "find a seller at sixty and a buyer at eighty");
    }

    #[test]
    fn primary_sources() {
        assert!(is_primary("https://www.dre.ca.gov/Consumers/"));
        assert!(is_primary("https://leginfo.legislature.ca.gov/faces/codes.xhtml"));
        assert!(!is_primary("https://www.realestateskills.com/blog/x"));
    }
}
