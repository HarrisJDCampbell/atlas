//! Tasks: give an agent a job, get drafts back, approve what goes out.
//!
//!   post      → 3 variants for X / LinkedIn / Threads, from what you actually shipped
//!   resume    → tailored summary + bullets for one posting, each traced to your resume
//!   outreach  → a LinkedIn note or email about one opportunity
//!
//! Agents read your resume and projects for facts; they never write to a project and
//! never publish. Every draft passes a Rust checker before you see it: channel length
//! limits, any number or tech term that isn't in your facts, and betting-hype phrases.

use crate::config::{self, Config};
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ───────────────────────────────────────────────────────────── storage ──

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct TaskInput {
    /// x | linkedin | threads | linkedin_note | email
    pub channel: String,
    pub project: String,
    pub topic: String,
    pub opportunity_id: String,
    pub job_text: String,
    /// recruiter | engineer | alum
    pub recipient: String,
    /// Who the post speaks for (identities.json) and which of its accounts.
    pub identity: String,
    pub account: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    pub channel: String,
    pub label: String,
    pub text: String,
    /// The exact fact (commit, resume line, roadmap item) the draft is built on.
    pub basis: String,
    /// What the checker objected to. Empty = clean.
    pub flags: Vec<String>,
    /// review | approved | rejected | used
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    /// post | resume | outreach
    pub kind: String,
    pub title: String,
    pub goal: String,
    /// running | review | done | failed
    pub status: String,
    pub created: String,
    pub finished: Option<String>,
    pub input: TaskInput,
    pub drafts: Vec<Draft>,
    pub notes: Vec<String>,
    pub log: Vec<String>,
    pub error: Option<String>,
    pub model: String,
}

fn dir() -> PathBuf {
    config::config_path().with_file_name("tasks")
}

fn path(id: &str) -> Result<PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(Error::msg("bad task id"));
    }
    Ok(dir().join(format!("{id}.json")))
}

fn save(t: &Task) -> Result<()> {
    std::fs::create_dir_all(dir())?;
    let p = path(&t.id)?;
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(t)?)?;
    std::fs::rename(tmp, p)?;
    Ok(())
}

fn load(id: &str) -> Result<Task> {
    Ok(serde_json::from_str(&std::fs::read_to_string(path(id)?)?)?)
}

/// Claims checked against the real code: `TERM | reason` per line. A draft containing
/// TERM is flagged even when the resume itself says it — the resume can be wrong.
pub fn corrections() -> Vec<(String, String)> {
    std::fs::read_to_string(config::config_path().with_file_name("career/corrections.md"))
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim_start().starts_with('#'))
        .filter_map(|l| l.split_once('|').map(|(t, r)| (t.trim().to_string(), r.trim().to_string())))
        .filter(|(t, _)| !t.is_empty())
        .collect()
}

pub fn resume_path() -> PathBuf {
    config::config_path().with_file_name("career/resume.md")
}

// ───────────────────────────────────────────────────────────── facts ──

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// Facts for a task: the chosen project, or else every project the identity speaks for.
fn facts_for(cfg: &Config, input: &TaskInput) -> String {
    let ident = crate::identities::find(&input.identity);
    let projects: Vec<String> = if !input.project.is_empty() {
        vec![input.project.clone()]
    } else {
        ident.as_ref().map(|i| i.projects.clone()).unwrap_or_default()
    };
    let mut out = String::new();
    for (i, p) in projects.iter().enumerate() {
        // Resume and profile once; then each project's own material.
        let f = facts(cfg, p);
        out.push_str(&if i == 0 { f } else { f.split("\n## Projects\n").nth(1).map(|t| t.to_string()).unwrap_or_default() });
    }
    if projects.is_empty() {
        out = facts(cfg, "");
    }
    if let Some(i) = ident {
        out.push_str(&format!("\n## Speaking as: {} ({})\n{}\n", i.name, i.kind, i.voice));
    }
    out
}

fn facts(cfg: &Config, project: &str) -> String {
    let mut out = String::new();
    if let Ok(r) = std::fs::read_to_string(resume_path()) {
        out.push_str(&format!("## Resume\n{}\n\n", clip(&r, 6000)));
    }
    out.push_str(&format!("## Profile\n{}\n\n## Projects\n", cfg.career_profile));
    for p in &cfg.projects {
        out.push_str(&format!("- {}: {}\n", p.name, p.tagline));
    }
    if let Some(p) = cfg.projects.iter().find(|p| p.id == project) {
        let root = config::expand(&p.path);
        if let Some((name, text)) = ["README.md", "AGENTS.md"].iter().find_map(|f| std::fs::read_to_string(root.join(f)).ok().map(|t| (*f, t))) {
            out.push_str(&format!("\n## {} {name}\n{}\n", p.name, clip(&text, 2500)));
        }
        if let Some(r) = crate::projects::roadmap(&root, &p.roadmap) {
            out.push_str(&format!("\n## {} roadmap: {}/{} done\n", p.name, r.done, r.total));
            for s in &r.sections {
                out.push_str(&format!("- {}: {}/{}\n", s.title, s.done, s.total));
            }
        }
        let log = std::process::Command::new("git").arg("-C").arg(&root)
            .args(["log", "--since=14.days.ago", "-25", "--format=%cs %s"]).output();
        if let Some(o) = log.ok().filter(|o| o.status.success() && !o.stdout.is_empty()) {
            out.push_str(&format!("\n## {} commits, last 14 days\n{}", p.name, String::from_utf8_lossy(&o.stdout)));
        }
    }
    out
}

// ─────────────────────────────────────────────────────────── checker ──

pub fn limit(channel: &str) -> Option<usize> {
    match channel {
        "x" => Some(280),
        "linkedin_note" => Some(300),
        "threads" => Some(500),
        "email" => Some(1500),
        "linkedin" => Some(3000),
        "instagram" | "tiktok" => Some(2200),
        "youtube" => Some(100),
        _ => None,
    }
}

/// Technologies that read as ordinary capitalised words ("Kubernetes", "Python"), so
/// the shape heuristic alone misses them. Naming one that isn't in the facts is a claim.
const TECH: &[&str] = &["python", "java", "rust", "kotlin", "swift", "scala", "ruby", "php", "golang", "haskell", "elixir",
    "react", "vue", "angular", "svelte", "node", "django", "flask", "fastapi", "spring", "rails", "laravel", "express",
    "kubernetes", "docker", "terraform", "ansible", "aws", "gcp", "azure", "lambda", "kafka", "redis", "postgres",
    "postgresql", "mysql", "mongodb", "dynamodb", "cassandra", "elasticsearch", "graphql", "grpc", "firebase", "supabase",
    "tensorflow", "pytorch", "keras", "pandas", "numpy", "spark", "hadoop", "airflow", "snowflake", "databricks",
    "tableau", "jenkins", "circleci", "linux", "typescript", "javascript", "tailwind", "flutter", "swiftui", "android",
    "unity", "unreal", "opencv", "langchain", "llamaindex", "openai", "xgboost", "ollama", "tauri", "electron", "expo",
    "railway", "vercel", "heroku", "netlify", "sentry", "datadog", "grafana", "prometheus", "nginx", "rabbitmq",
    "celery", "webrtc", "solidity", "ethereum", "blockchain", "jira", "figma", "mlx", "cuda", "hugging", "huggingface"];

const HYPE: &[&str] = &["guaranteed", "lock of the", "locks", "sure thing", "can't lose", "cant lose", "free money", "risk-free", "risk free", "easy money"];

/// Tokens that look like specific claims: numbers, and tech names (camelCase,
/// ALLCAPS, or with . + #). Common words never match, so the checker stays quiet
/// on ordinary prose and loud on invented specifics.
fn claim_tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    // Commas stay inside tokens so "10,000" is one claim, not "10" and "000".
    for raw in text.split(|c: char| c.is_whitespace() || ";()[]\"!?/".contains(c)) {
        let t = raw.trim_matches(|c: char| ".,:'*-".contains(c));
        if t.len() < 2 || t.starts_with("http") || t.starts_with('@') || t.starts_with('#') {
            continue;
        }
        let has_digit = t.chars().any(|c| c.is_ascii_digit());
        let inner_upper = t.chars().skip(1).any(|c| c.is_ascii_uppercase()) && t.chars().any(|c| c.is_ascii_lowercase());
        let all_caps = t.len() <= 6 && t.chars().all(|c| c.is_ascii_uppercase()) && t != "I";
        let techy = t.contains('.') && t.chars().any(|c| c.is_ascii_alphabetic()) || t.contains('+') || t.ends_with('#');
        if has_digit || inner_upper || all_caps || techy {
            out.push(t.to_string());
        }
    }
    out.dedup();
    out
}

/// The checker plus the identity's own banned phrases.
pub fn check_as(text: &str, facts: &str, channel: &str, identity: &str) -> Vec<String> {
    let mut flags = check(text, facts, channel);
    if let Some(i) = crate::identities::find(identity) {
        let lower = text.to_lowercase();
        let hits: Vec<&String> = i.banned.iter().filter(|b| !b.is_empty() && lower.contains(&b.to_lowercase())).collect();
        if !hits.is_empty() {
            flags.push(format!("{} never says: {}", i.name, hits.iter().map(|h| h.as_str()).collect::<Vec<_>>().join(", ")));
        }
    }
    flags
}

pub fn check(text: &str, facts: &str, channel: &str) -> Vec<String> {
    let mut flags = Vec::new();
    if let Some(n) = limit(channel) {
        let len = text.chars().count();
        if len > n {
            flags.push(format!("{len}/{n} characters — too long for {channel}"));
        }
    }
    let f = facts.to_lowercase();
    let f_nocomma = f.replace(',', "");
    let f_nospace: String = f.chars().filter(|c| !c.is_whitespace()).collect();
    let unsupported: Vec<String> = claim_tokens(text).into_iter()
        .filter(|t| {
            let l = t.to_lowercase();
            // "2026" style years and ordinary counts under 10 are not claims worth flagging.
            let trivial = l.chars().all(|c| c.is_ascii_digit()) && (l.len() == 4 && l.starts_with("20") || l.parse::<u32>().is_ok_and(|n| n < 10));
            !trivial && !f.contains(&l) && !f_nocomma.contains(&l.replace(',', "")) && !f_nospace.contains(&l.replace(',', ""))
        })
        .collect();
    let mut unsupported = unsupported;
    for w in text.split(|c: char| !(c.is_alphanumeric() || c == '.' || c == '+' || c == '#')) {
        let l = w.trim_matches('.').to_lowercase();
        if TECH.contains(&l.as_str()) && !f.contains(&l) && !unsupported.iter().any(|u| u.eq_ignore_ascii_case(&l)) {
            unsupported.push(w.trim_matches('.').to_string());
        }
    }
    if !unsupported.is_empty() {
        flags.push(format!("not in your facts: {}", unsupported.join(", ")));
    }
    let lower = text.to_lowercase();
    for (term, why) in corrections() {
        if lower.contains(&term.to_lowercase()) {
            flags.push(format!("{term}: {why}"));
        }
    }
    let hype: Vec<&str> = HYPE.iter().copied().filter(|h| lower.contains(h)).collect();
    if !hype.is_empty() {
        flags.push(format!("betting-hype language: {}", hype.join(", ")));
    }
    flags
}

/// The draft checker against the resume and profile only, for text arriving from
/// outside Atlas (an n8n approval) that has no project of its own.
pub fn check_against_profile(text: &str, channel: &str) -> Vec<String> {
    match config::load() {
        Ok(cfg) => check(text, &facts(&cfg, ""), channel),
        Err(_) => vec![],
    }
}

// ───────────────────────────────────────────────────────────── model ──

async fn generate(cfg: &Config, system: &str, user: &str, schema: Value) -> Result<Value> {
    let body = json!({"model": cfg.agent_models.project, "stream": false, "think": false, "format": schema,
        "options": {"num_ctx": 16384, "temperature": 0.7},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]});
    let resp = reqwest::Client::new().post(format!("{}/api/chat", cfg.ollama_url))
        .timeout(Duration::from_secs(600)).json(&body).send().await
        .map_err(|e| Error::msg(format!("Ollama unreachable: {e}")))?;
    let v: Value = resp.json().await?;
    let content = v["message"]["content"].as_str().ok_or_else(|| Error::msg(format!("Ollama: {}", v["error"])))?;
    serde_json::from_str(content).map_err(|e| Error::msg(format!("model returned malformed JSON: {e}")))
}

/// The writer's brief, from the profile in config.
fn voice(cfg: &Config) -> String {
    format!("You write for {}, {}. \
        Voice: first person, plain, specific, a little dry — never hype, never corporate. Use ONLY facts from the provided \
        facts: never invent numbers, users, revenue, employers, tools or results. If a detail isn't in the facts, leave it out.",
        cfg.profile.who(), cfg.profile.about)
}

fn drafts_schema() -> Value {
    json!({"type": "object", "properties": {"drafts": {"type": "array", "items": {"type": "object",
        "properties": {"label": {"type": "string"}, "text": {"type": "string"}, "basis": {"type": "string"}},
        "required": ["label", "text", "basis"]}}}, "required": ["drafts"]})
}

const BASIS: &str = "For every draft, `basis` = the exact words (copied character for character, 6-30 words) \
of the line in the facts the draft is built on: a commit message, a resume bullet, or a roadmap item. A story \
with no line in the facts behind it must not be written.";

/// Narrative inventions carry no checkable numbers or names; the basis catches them.
/// It must be a real line from the facts, compared ignoring case and spacing.
pub fn basis_ok(basis: &str, facts: &str) -> bool {
    let norm = |x: &str| x.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    let b = norm(basis.trim_matches(|c: char| c == '"' || c == '\'' || c == '.'));
    b.len() >= 12 && norm(facts).contains(&b)
}

fn opportunity_text(input: &TaskInput) -> String {
    if !input.job_text.trim().is_empty() {
        return clip(&input.job_text, 6000);
    }
    crate::inbox::find_opportunity(&input.opportunity_id)
        .map(|o| format!("{} at {}\nLocation: {}\nPay: {}\nDeadline: {}\n{}\n(From Handshake email: {})",
            o.title, o.employer, o.location, o.pay, o.deadline, o.summary, o.email_subject))
        .unwrap_or_default()
}

async fn run(cfg: &Config, t: &mut Task, emit: &(dyn Fn(&Task) + Sync)) -> Result<()> {
    let facts = facts_for(cfg, &t.input);
    let push = |t: &mut Task, line: &str| { t.log.push(line.to_string()); emit(t); };
    push(t, &format!("gathered facts: resume + profile{}", if t.input.project.is_empty() { String::new() } else { format!(" + {} commits/roadmap", t.input.project) }));

    let raw: Vec<(String, String, String, String)> = match t.kind.as_str() {
        "post" => {
            let ch = t.input.channel.clone();
            let rules = match ch.as_str() {
                "x" => "X post: at most 260 characters, no more than one hashtag, no thread.",
                "threads" => "Threads post: at most 450 characters, conversational.",
                "instagram" => "Instagram caption: hook in the first line, 40-120 words, line breaks between ideas, 3-5 relevant hashtags at the end.",
                "tiktok" => "TikTok caption: one punchy hook line, then at most 2 short lines, 3-4 hashtags. The video does the talking.",
                "youtube" => "YouTube Shorts title: at most 90 characters, specific and curiosity-driving, no clickbait lies.",
                _ => "LinkedIn post: 80-180 words, short paragraphs, a concrete takeaway, no hashtag wall (max 3), no 'I'm thrilled to announce'.",
            };
            push(t, &format!("drafting 3 {ch} variants"));
            // A "lesson" post is a story, and stories can't be checked against facts — only
            // the author knows what went wrong. So the lesson angle exists only when he supplies it.
            let topic = t.input.topic.trim();
            let angles = if topic.is_empty() {
                "(1) a build-in-public progress update, (2) a short technical explainer of how one thing works, \
                 (3) the shortest, punchiest version. Do not invent anecdotes, struggles or lessons."
            } else {
                "(1) a build-in-public progress update, (2) the lesson in the author's own words above — expand it, don't add events, \
                 (3) the shortest, punchiest version."
            };
            let voice = match crate::identities::find(&t.input.identity) {
                Some(i) if i.kind == "business" => format!("You write posts for the {} brand account, run by {}. {} \
                    Speak as the brand (\"we\" or no pronoun), not as its founder. {} Use ONLY facts from the provided facts: never invent \
                    numbers, users, results or features.", i.name, cfg.profile.who(), i.voice, i.rules.join(" ")),
                Some(i) => format!("{} {}", voice(cfg), i.voice),
                None => voice(cfg),
            };
            let v = generate(cfg, &voice, &format!(
                "Facts:\n{facts}\n\nWrite 3 different {ch} posts{}. {rules}\nAngles: {angles} \
                 label = the angle. {BASIS}",
                if topic.is_empty() { String::new() } else { format!(" about this, in the author's words: \"{topic}\"") }), drafts_schema()).await?;
            v["drafts"].as_array().into_iter().flatten()
                .map(|d| (ch.clone(), d["label"].as_str().unwrap_or("").to_string(), d["text"].as_str().unwrap_or("").to_string(), d["basis"].as_str().unwrap_or("").to_string())).collect()
        }
        "resume" => {
            let job = opportunity_text(&t.input);
            if job.is_empty() {
                return Err(Error::msg("no job posting: pick a Handshake match or paste the job description"));
            }
            push(t, "tailoring summary and bullets to the posting");
            let schema = json!({"type": "object", "properties": {
                "summary": {"type": "string"},
                "bullets": {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}, "from": {"type": "string"}, "basis": {"type": "string"}}, "required": ["text", "from", "basis"]}},
                "gaps": {"type": "array", "items": {"type": "string"}}}, "required": ["summary", "bullets", "gaps"]});
            let v = generate(cfg, &format!("{} You tailor resumes. Every bullet must be a rewrite of an existing resume \
                bullet — reorder emphasis and mirror the posting's language only where it's true. Never add a skill, tool, \
                metric or responsibility that isn't in the resume or facts.", voice(cfg)), &format!(
                "Facts (the resume is the source of truth):\n{facts}\n\nJob posting:\n{job}\n\nReturn: summary (2 sentences tailored \
                 to this role), bullets (the 5 strongest resume bullets for this role, each rewritten; `from` = the project it \
                 comes from, `basis` = the original resume bullet's opening words copied exactly), gaps (requirements in the posting \
                 the resume doesn't show — be honest, these are for the candidate to decide on, not to fake)."), schema).await?;
            for g in v["gaps"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                t.notes.push(format!("gap: {g}"));
            }
            // The summary is a synthesis of the whole resume, so it has no single basis line.
            let mut out = vec![("resume".to_string(), "Tailored summary".to_string(), v["summary"].as_str().unwrap_or("").to_string(), "(whole resume)".to_string())];
            out.extend(v["bullets"].as_array().into_iter().flatten().enumerate().map(|(i, b)|
                ("resume".to_string(), format!("Bullet {} · {}", i + 1, b["from"].as_str().unwrap_or("")), b["text"].as_str().unwrap_or("").to_string(), b["basis"].as_str().unwrap_or("").to_string())));
            out
        }
        "outreach" => {
            let job = opportunity_text(&t.input);
            if job.is_empty() {
                return Err(Error::msg("no opportunity: pick a Handshake match or paste the posting"));
            }
            let ch = if t.input.channel == "email" { "email" } else { "linkedin_note" };
            let who = if t.input.recipient.is_empty() { "recruiter".to_string() } else { t.input.recipient.clone() };
            push(t, &format!("drafting 2 {ch} messages to a {who}"));
            let v = generate(cfg, &format!("{} You write short, respectful outreach. No flattery, no 'I hope this finds you well', \
                one clear ask.", voice(cfg)), &format!(
                "Facts:\n{facts}\n\nOpportunity:\n{job}\n\nWrite 2 {} to a {who} about this role. {}\nConnect ONE specific thing he built \
                 to what the role needs. Leave [Name] as a placeholder for the recipient. {BASIS}",
                if ch == "email" { "emails (subject line first, then 80-130 words)" } else { "LinkedIn connection notes" },
                if ch == "email" { "" } else { "Each at most 280 characters — LinkedIn cuts notes at 300." }), drafts_schema()).await?;
            v["drafts"].as_array().into_iter().flatten()
                .map(|d| (ch.to_string(), d["label"].as_str().unwrap_or("").to_string(), d["text"].as_str().unwrap_or("").to_string(), d["basis"].as_str().unwrap_or("").to_string())).collect()
        }
        other => return Err(Error::msg(format!("unknown task kind '{other}'"))),
    };

    push(t, "checking every draft against your facts");
    t.drafts = raw.into_iter().filter(|(_, _, text, _)| !text.trim().is_empty()).enumerate().map(|(i, (channel, label, text, basis))| {
        let mut flags = check_as(&text, &facts, &channel, &t.input.identity);
        if basis != "(whole resume)" && !basis_ok(&basis, &facts) {
            flags.push("no real basis in your facts — possibly an invented story".into());
        }
        Draft { id: format!("d{}", i + 1), flags, channel, label, basis, text: text.trim().to_string(), status: "review".into() }
    }).collect();
    let clean = t.drafts.iter().filter(|d| d.flags.is_empty()).count();
    push(t, &format!("{} drafts · {clean} clean · {} flagged", t.drafts.len(), t.drafts.len() - clean));
    Ok(())
}

// ─────────────────────────────────────────────────────────── commands ──

#[tauri::command]
pub fn tasks_list() -> Result<Vec<Task>> {
    let mut out: Vec<Task> = std::fs::read_dir(dir()).into_iter().flatten().flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).ok())
        .collect();
    out.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(out)
}

#[tauri::command]
pub fn task_create(app: AppHandle, kind: String, title: String, goal: String, input: TaskInput) -> Result<String> {
    let cfg = config::load()?;
    // Schedules re-run: one draft task per opportunity + kind + channel is enough.
    if !input.opportunity_id.is_empty()
        && let Some(existing) = tasks_list()?.into_iter().find(|t| t.kind == kind
            && t.input.opportunity_id == input.opportunity_id && t.input.channel == input.channel && t.status != "failed")
    {
        return Ok(existing.id);
    }
    let id = format!("{}-{}", kind, &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let mut t = Task {
        id: id.clone(), kind, goal, title, input, status: "running".into(),
        created: chrono::Local::now().to_rfc3339(), model: cfg.agent_models.project.clone(), ..Default::default()
    };
    save(&t)?;
    tauri::async_runtime::spawn(async move {
        let emit = |t: &Task| { let _ = save(t); let _ = app.emit("task-event", t.clone()); };
        match run(&cfg, &mut t, &emit).await {
            Ok(()) => t.status = "review".into(),
            Err(e) => { t.status = "failed".into(); t.error = Some(e.to_string()); }
        }
        t.finished = Some(chrono::Local::now().to_rfc3339());
        emit(&t);
    });
    Ok(id)
}

/// Edit a draft's text (re-checked) and/or set its status.
#[tauri::command]
pub fn task_draft_update(task_id: String, draft_id: String, text: Option<String>, status: Option<String>) -> Result<Task> {
    let cfg = config::load()?;
    let mut t = load(&task_id)?;
    let facts = facts_for(&cfg, &t.input);
    let d = t.drafts.iter_mut().find(|d| d.id == draft_id).ok_or_else(|| Error::msg("no such draft"))?;
    if let Some(text) = text {
        d.flags = check_as(&text, &facts, &d.channel, &t.input.identity);
        if d.basis != "(whole resume)" && !basis_ok(&d.basis, &facts) {
            d.flags.push("no real basis in your facts — possibly an invented story".into());
        }
        d.text = text;
    }
    if let Some(s) = status {
        if !["review", "approved", "rejected", "used"].contains(&s.as_str()) {
            return Err(Error::msg("bad status"));
        }
        d.status = s;
    }
    if t.drafts.iter().all(|d| d.status != "review") {
        t.status = "done".into();
    }
    save(&t)?;
    Ok(t)
}

#[tauri::command]
pub fn task_delete(task_id: String) -> Result<()> {
    let p = path(&task_id)?;
    let trash = dir().join(".trash");
    std::fs::create_dir_all(&trash)?;
    std::fs::rename(&p, trash.join(p.file_name().unwrap_or_default()))?;
    Ok(())
}

/// Copies text to the macOS clipboard (for channels without a pre-filled composer).
#[tauri::command]
pub fn copy_text(text: String) -> Result<()> {
    use std::io::Write;
    let mut child = std::process::Command::new("/usr/bin/pbcopy").stdin(std::process::Stdio::piped()).spawn()?;
    child.stdin.take().ok_or_else(|| Error::msg("pbcopy"))?.write_all(text.as_bytes())?;
    child.wait()?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeInfo {
    exists: bool,
    words: usize,
    updated: Option<String>,
    path: String,
}

#[tauri::command]
pub fn resume_info() -> Result<ResumeInfo> {
    let p = resume_path();
    let text = std::fs::read_to_string(&p).unwrap_or_default();
    Ok(ResumeInfo {
        exists: !text.is_empty(),
        words: text.split_whitespace().count(),
        updated: std::fs::metadata(&p).ok().and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Local>::from(t).to_rfc3339()),
        path: p.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FACTS: &str = "Built Atlas with Rust and Tauri. VisBets uses TypeScript, Express, Supabase. About 700 projections per day.";

    #[test]
    fn flags_invented_specifics_only() {
        assert!(check("Shipping Atlas this week. Rust + Tauri, all local.", FACTS, "x").is_empty());
        let f = check("Scaled VisBets to 10,000 users on Kubernetes and AWS.", FACTS, "x");
        assert!(f.iter().any(|x| x.contains("10,000") && x.contains("Kubernetes") && x.contains("AWS")), "{f:?}");
        assert!(check("VisBets runs about 700 projections per day.", FACTS, "x").is_empty(), "grounded number passes");
    }

    #[test]
    fn basis_must_be_a_real_fact() {
        assert!(basis_ok("Built Atlas with Rust and Tauri", FACTS));
        assert!(basis_ok("built atlas   with RUST and tauri.", FACTS), "case and spacing don't matter");
        assert!(!basis_ok("Built a data pipeline tool and forgot edge cases", FACTS));
        assert!(!basis_ok("Atlas", FACTS), "too short to be evidence");
        assert!(check("Atlas is a 7MB app.", "it ships as a 7 MB app", "x").is_empty(), "7MB == 7 MB");
    }

    #[test]
    fn enforces_channel_limits_and_hype() {
        let long = "a ".repeat(200);
        assert!(check(&long, FACTS, "x").iter().any(|f| f.contains("too long")));
        assert!(check(&long, FACTS, "linkedin").is_empty());
        assert!(check("Tonight's lock: guaranteed winner.", FACTS, "x").iter().any(|f| f.contains("hype")));
    }

    /// Runs and saves real tasks so the queues have genuine drafts to review.
    ///   cargo test seed_real_tasks -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn seed_real_tasks() {
        let cfg = config::load().unwrap();
        let top = crate::inbox::opportunities_get().unwrap().items.into_iter().next();
        let mut jobs = vec![("post", "LinkedIn post · Atlas".to_string(), TaskInput { channel: "linkedin".into(), project: "atlas".into(), ..Default::default() })];
        if let Some(o) = top {
            jobs.push(("outreach", format!("LinkedIn note · {} — {}", o.title, o.employer), TaskInput { channel: "linkedin_note".into(), recipient: "recruiter".into(), opportunity_id: o.id, ..Default::default() }));
        }
        for (kind, title, input) in jobs {
            let mut t = Task { id: format!("{kind}-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]), kind: kind.into(), title, input,
                status: "running".into(), created: chrono::Local::now().to_rfc3339(), model: cfg.agent_models.project.clone(), ..Default::default() };
            match run(&cfg, &mut t, &|_| {}).await {
                Ok(()) => t.status = "review".into(),
                Err(e) => { t.status = "failed".into(); t.error = Some(e.to_string()); }
            }
            t.finished = Some(chrono::Local::now().to_rfc3339());
            save(&t).unwrap();
            println!("== {} [{}]", t.title, t.status);
            for d in &t.drafts { println!("  [{}] ({} chars) {}\n    basis: {}\n    flags: {:?}", d.label, d.text.chars().count(), d.text, d.basis, d.flags); }
        }
    }

    /// Live: a VisBets-voice Instagram caption. cargo test live_brand_post -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_brand_post() {
        let cfg = config::load().unwrap();
        let mut t = Task { kind: "post".into(), input: TaskInput { channel: "instagram".into(), identity: "visbets".into(), account: "visbets-instagram".into(), ..Default::default() }, ..Default::default() };
        run(&cfg, &mut t, &|_| {}).await.unwrap();
        for d in &t.drafts { println!("[{}] ({} chars)\n{}\n  basis: {}\n  flags: {:?}\n", d.label, d.text.chars().count(), d.text, d.basis, d.flags); }
    }

    /// Live: a real X post task from real facts. cargo test live_post -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_post() {
        let cfg = config::load().unwrap();
        let mut t = Task { kind: "post".into(), input: TaskInput { channel: "x".into(), project: "atlas".into(), ..Default::default() }, ..Default::default() };
        let t0 = std::time::Instant::now();
        run(&cfg, &mut t, &|_| {}).await.unwrap();
        println!("{:?}\n", t0.elapsed());
        for d in &t.drafts {
            println!("[{}] ({} chars) {}\n  basis: {}\n  flags: {:?}\n", d.label, d.text.chars().count(), d.text, d.basis, d.flags);
        }
        assert!(!t.drafts.is_empty());
    }

    /// Live: tailor the real resume to the top Handshake match. cargo test live_resume -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_resume() {
        let cfg = config::load().unwrap();
        let top = crate::inbox::opportunities_get().unwrap().items.into_iter().next().expect("needs a scanned Handshake feed");
        println!("target: {} — {}\n", top.title, top.employer);
        let mut t = Task { kind: "resume".into(), input: TaskInput { opportunity_id: top.id, ..Default::default() }, ..Default::default() };
        let t0 = std::time::Instant::now();
        run(&cfg, &mut t, &|_| {}).await.unwrap();
        println!("{:?}\n", t0.elapsed());
        for d in &t.drafts { println!("[{}] {}\n  basis: {}\n  flags: {:?}", d.label, d.text, d.basis, d.flags); }
        for n in &t.notes { println!("{n}"); }
    }
}
