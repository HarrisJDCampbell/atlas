//! Handshake inbox agent: reads Handshake emails, extracts opportunities with a
//! local model, keeps only what's really in the email, and ranks fit.
//!
//!   Mail.app (signed in to school Outlook) ┐
//!   ~/.config/atlas/inbox-drop/*.eml ─────┴─► raw MIME ─► text + numbered links
//!        ─► model extracts items (links by index only) ─► verify title+employer in text
//!        ─► model scores fit against the career profile ─► Career mode feed
//!
//! Read-only by construction: nothing here can send, reply, delete or apply.

use crate::config;
use crate::error::{Error, Result};
use crate::research::normalize;
use mailparse::{MailHeaderMap, ParsedMail};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

// ───────────────────────────────────────────────────────────── storage ──

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Opportunity {
    pub id: String,
    pub message_id: String,
    pub received: String,
    pub email_subject: String,
    /// internship | job | event | message | deadline | other
    pub kind: String,
    pub title: String,
    pub employer: String,
    pub location: String,
    pub pay: String,
    pub deadline: String,
    pub link: String,
    pub summary: String,
    pub score: u8,
    pub reasons: String,
    /// yes | no | unknown — does it look open to someone with the profile's graduation date?
    pub eligible: String,
    /// new | saved | dismissed | added
    pub status: String,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Store {
    /// message-id → when it was processed, so each email is read once.
    seen: HashMap<String, String>,
    items: Vec<Opportunity>,
    last_scan: Option<String>,
    last_source: String,
}

fn store_path() -> PathBuf {
    config::config_path().with_file_name("opportunities.json")
}

pub fn drop_dir() -> PathBuf {
    config::config_path().with_file_name("inbox-drop")
}

fn load_store() -> Store {
    std::fs::read_to_string(store_path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn save_store(s: &Store) -> Result<()> {
    let p = store_path();
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(s)?)?;
    std::fs::rename(tmp, p)?;
    Ok(())
}

// ───────────────────────────────────────────────────────────── parsing ──

#[derive(Debug, Clone)]
pub struct Email {
    pub id: String,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub text: String,
    /// (anchor text, href), in order of appearance
    pub links: Vec<(String, String)>,
}

fn collect<'a>(m: &'a ParsedMail<'a>, plain: &mut Vec<String>, html: &mut Vec<String>) {
    if m.subparts.is_empty() {
        let mime = m.ctype.mimetype.to_lowercase();
        if let Ok(body) = m.get_body() {
            if mime == "text/plain" {
                plain.push(body);
            } else if mime == "text/html" {
                html.push(body);
            }
        }
    }
    for p in &m.subparts {
        collect(p, plain, html);
    }
}

/// Pulls `<a href>` targets with their visible text. Tracking pixels and
/// unsubscribe/settings links are dropped so the model sees only the real ones.
pub fn extract_links(html: &str) -> Vec<(String, String)> {
    let lower = html.to_lowercase();
    let mut out: Vec<(String, String)> = Vec::new();
    let mut i = 0;
    while let Some(a) = lower[i..].find("<a ") {
        let start = i + a;
        let Some(tag_end) = lower[start..].find('>').map(|e| start + e) else { break };
        let tag = &html[start..tag_end];
        let close = lower[tag_end..].find("</a>").map(|e| tag_end + e).unwrap_or(tag_end);
        i = close.max(tag_end + 1);
        let href = tag
            .split("href=")
            .nth(1)
            .and_then(|r| {
                let q = r.chars().next()?;
                if q == '"' || q == '\'' { r[1..].split(q).next() } else { r.split([' ', '>']).next() }
            })
            .unwrap_or("")
            .replace("&amp;", "&");
        if !href.starts_with("http") {
            continue;
        }
        let inner = &html[tag_end + 1..close.max(tag_end + 1)];
        let text = html2text::from_read(inner.as_bytes(), 200).unwrap_or_default();
        let text: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
        let l = format!("{} {}", text.to_lowercase(), href.to_lowercase());
        if l.contains("unsubscribe") || l.contains("preferences") || l.contains("privacy") || l.contains("settings") {
            continue;
        }
        if !out.iter().any(|(_, h)| *h == href) {
            out.push((text.chars().take(80).collect(), href));
        }
    }
    out
}

pub fn parse_email(raw: &[u8], fallback_id: &str) -> Option<Email> {
    let m = mailparse::parse_mail(raw).ok()?;
    let h = &m.headers;
    let (mut plain, mut html) = (Vec::new(), Vec::new());
    collect(&m, &mut plain, &mut html);
    let links = html.iter().flat_map(|x| extract_links(x)).collect();
    let text = if let Some(p) = plain.iter().find(|p| p.trim().len() > 40) {
        p.clone()
    } else {
        html.iter().map(|x| html2text::from_read(x.as_bytes(), 120).unwrap_or_default()).collect::<Vec<_>>().join("\n")
    };
    // Strip html2text's footnote link references; links are handled separately.
    let text: String = text.lines().filter(|l| !l.trim_start().starts_with('[')).collect::<Vec<_>>().join("\n");
    Some(Email {
        id: h.get_first_value("Message-ID").unwrap_or_else(|| fallback_id.to_string()),
        subject: h.get_first_value("Subject").unwrap_or_default(),
        from: h.get_first_value("From").unwrap_or_default(),
        date: h
            .get_first_value("Date")
            .and_then(|d| mailparse::dateparse(&d).ok())
            .and_then(|t| chrono::DateTime::from_timestamp(t, 0))
            .map(|t| t.to_rfc3339())
            .unwrap_or_default(),
        text,
        links,
    })
}

// ───────────────────────────────────────────────────────────── sources ──

/// Asks Mail.app (via JavaScript for Automation) for raw Handshake messages.
/// Mail owns the Outlook sign-in; Atlas never sees a password or token.
const MAIL_JXA: &str = r#"
function run(argv) {
  const days = parseInt(argv[0] || "45"), match = (argv[1] || "handshake").toLowerCase();
  const Mail = Application("Mail");
  if (Mail.accounts().length === 0) return JSON.stringify({ error: "no-accounts" });
  const since = new Date(Date.now() - days * 864e5);
  const msgs = Mail.inbox.messages.whose({ dateReceived: { ">": since } })();
  const out = [];
  for (const m of msgs) {
    let sender = "";
    try { sender = m.sender().toLowerCase(); } catch (e) { continue; }
    if (sender.indexOf(match) < 0) continue;
    try { out.push({ id: m.messageId(), source: m.source() }); } catch (e) {}
  }
  return JSON.stringify({ messages: out });
}
"#;

async fn from_mail_app(days: u32, matcher: &str) -> std::result::Result<Vec<Email>, String> {
    let out = tokio::time::timeout(
        Duration::from_secs(180),
        tokio::process::Command::new("/usr/bin/osascript")
            .args(["-l", "JavaScript", "-e", MAIL_JXA, &days.to_string(), matcher])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| "Mail took longer than 3 minutes to answer".to_string())?
    .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(if err.contains("-1743") || err.contains("Not authorized") {
            "macOS blocked Atlas from talking to Mail. Allow it in System Settings → Privacy & Security → Automation.".into()
        } else {
            format!("Mail: {}", err.trim())
        });
    }
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("Mail returned unreadable data: {e}"))?;
    if v["error"] == "no-accounts" {
        return Err("Mail.app has no accounts. Add your school or work account in Mail → Settings → Accounts.".into());
    }
    Ok(v["messages"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| parse_email(m["source"].as_str()?.as_bytes(), m["id"].as_str().unwrap_or("")))
        .collect())
}

fn from_drop_folder() -> Vec<Email> {
    let dir = drop_dir();
    let _ = std::fs::create_dir_all(&dir);
    std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "eml"))
        .filter_map(|p| parse_email(&std::fs::read(&p).ok()?, &p.display().to_string()))
        .collect()
}

// ─────────────────────────────────────────────────────────── the agent ──

#[derive(Deserialize)]
struct Extracted {
    items: Vec<RawItem>,
}

#[derive(Deserialize)]
struct RawItem {
    kind: String,
    title: String,
    employer: String,
    #[serde(default)]
    location: String,
    #[serde(default)]
    pay: String,
    #[serde(default)]
    deadline: String,
    /// "L3" style index into the email's links, or ""
    #[serde(default)]
    link: String,
    #[serde(default)]
    summary: String,
}

#[derive(Deserialize)]
struct Scores {
    scores: Vec<RawScore>,
}

#[derive(Deserialize)]
struct RawScore {
    index: usize,
    score: u8,
    eligible: String,
    reasons: String,
}

async fn ollama(base: &str, model: &str, messages: Value, schema: Value) -> Result<Value> {
    let resp = reqwest::Client::new()
        .post(format!("{base}/api/chat"))
        .timeout(Duration::from_secs(300))
        .json(&json!({"model": model, "messages": messages, "stream": false, "think": false,
                      "format": schema, "options": {"num_ctx": 16384, "temperature": 0.1}}))
        .send()
        .await
        .map_err(|e| Error::msg(format!("Ollama unreachable: {e}")))?;
    let v: Value = resp.json().await?;
    let content = v["message"]["content"].as_str().ok_or_else(|| Error::msg(format!("Ollama: {}", v["error"])))?;
    serde_json::from_str(content).map_err(|e| Error::msg(format!("model returned malformed JSON: {e}")))
}

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// Present in the email (subject or body), ignoring case and spacing.
fn grounded(field: &str, email: &Email) -> bool {
    let f = normalize(field);
    !f.is_empty() && (normalize(&email.text).contains(&f) || normalize(&email.subject).contains(&f))
}

pub async fn extract(base: &str, model: &str, email: &Email) -> Result<Vec<Opportunity>> {
    let links: String = email.links.iter().enumerate().map(|(i, (t, _))| format!("L{}: {}", i + 1, if t.is_empty() { "(link)" } else { t })).collect::<Vec<_>>().join("\n");
    let schema = json!({"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
        "kind": {"type": "string", "enum": ["internship", "job", "event", "message", "deadline", "other"]},
        "title": {"type": "string"}, "employer": {"type": "string"}, "location": {"type": "string"},
        "pay": {"type": "string"}, "deadline": {"type": "string"}, "link": {"type": "string"}, "summary": {"type": "string"}},
        // Every field required: with constrained decoding, optional fields tend to get skipped.
        "required": ["kind", "title", "employer", "location", "pay", "deadline", "link", "summary"]}}}, "required": ["items"]});
    let v = ollama(base, model, json!([
        {"role": "system", "content": "You extract opportunities from a Handshake email. One item per distinct job, \
            internship, event or employer message. Copy title and employer exactly as written in the email. kind is \
            \"internship\" whenever the title or text says intern/internship/co-op. location, pay and deadline: copy \
            them from the email (e.g. \"San Francisco, CA\", \"$48/hr\", \"Nov 15, 2026\") or \"\" if absent. For link, \
            answer with the label of the matching link (like \"L3\") or an empty string; never write a URL. Leave a \
            field empty if the email doesn't say it. summary: one plain sentence."},
        {"role": "user", "content": format!("Subject: {}\nFrom: {}\n\n{}\n\nLinks:\n{links}", email.subject, email.from, clip(&email.text, 9000))}
    ]), schema).await?;
    let ex: Extracted = serde_json::from_value(v)?;

    Ok(ex.items.into_iter()
        // Drop anything the model can't point to in the email itself.
        .filter(|it| grounded(&it.title, email) && grounded(&it.employer, email))
        .map(|it| {
            let link = it.link.trim().trim_start_matches(['L', 'l']).parse::<usize>().ok()
                .and_then(|n| email.links.get(n.wrapping_sub(1)))
                .map(|(_, h)| h.clone())
                .unwrap_or_default();
            // Decide "internship" from the role's own words, not the model's guess.
            let says_intern = {
                let t = format!("{} {}", it.title, it.summary).to_lowercase();
                t.contains("intern") || t.contains("co-op") || t.contains("coop")
            };
            let kind = match it.kind.as_str() {
                "internship" | "job" => if says_intern { "internship" } else { "job" }.to_string(),
                _ if says_intern => "internship".to_string(),
                other => other.to_string(),
            };
            let id = format!("{:x}", stable_hash(&format!("{}|{}|{}", email.id, it.title, it.employer)));
            Opportunity {
                id, message_id: email.id.clone(), received: email.date.clone(), email_subject: email.subject.clone(),
                kind, title: it.title, employer: it.employer, location: it.location, pay: it.pay,
                deadline: it.deadline, link, summary: it.summary, status: "new".into(), eligible: "unknown".into(),
                ..Default::default()
            }
        })
        .collect())
}

/// FNV-1a: stable across Rust versions (DefaultHasher isn't), so ids survive toolchain updates.
fn stable_hash(s: &str) -> u64 {
    s.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3))
}

pub async fn score(base: &str, model: &str, profile: &str, items: &mut [Opportunity]) -> Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    let list: String = items.iter().enumerate().map(|(i, o)| format!(
        "{i}. [{}] {} — {} | {} | {} | deadline: {} | {}", o.kind, o.title, o.employer, o.location, o.pay, o.deadline, o.summary)).collect::<Vec<_>>().join("\n");
    let schema = json!({"type": "object", "properties": {"scores": {"type": "array", "items": {"type": "object", "properties": {
        "index": {"type": "integer"}, "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "eligible": {"type": "string", "enum": ["yes", "no", "unknown"]}, "reasons": {"type": "string"}},
        "required": ["index", "score", "eligible", "reasons"]}}}, "required": ["scores"]});
    let v = ollama(base, model, json!([
        {"role": "system", "content": "You are a blunt career advisor. Score each opportunity 0-100 for fit with the \
            candidate. 80+: apply now. 50-79: worth a look. Below 50: skip. Unpaid, non-technical or wrong-grad-year \
            roles score low. eligible: whether a candidate graduating in the profile's year can apply (unknown if the \
            listing doesn't say). reasons: one short sentence naming the deciding factor."},
        {"role": "user", "content": format!("Candidate profile:\n{profile}\n\nOpportunities:\n{list}")}
    ]), schema).await?;
    let s: Scores = serde_json::from_value(v)?;
    for r in s.scores {
        if let Some(o) = items.get_mut(r.index) {
            o.score = r.score.min(100);
            o.eligible = r.eligible;
            o.reasons = r.reasons;
        }
    }
    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanEvent {
    stage: String,
    detail: String,
    done: usize,
    total: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    emails: usize,
    new_emails: usize,
    new_items: usize,
    source: String,
    warning: Option<String>,
}

#[derive(Default)]
pub struct Scanning(Mutex<bool>);

#[tauri::command]
pub async fn inbox_scan(app: AppHandle, scanning: State<'_, Scanning>) -> Result<ScanResult> {
    {
        let mut s = scanning.0.lock().unwrap();
        if *s {
            return Err(Error::msg("a scan is already running"));
        }
        *s = true;
    }
    let r = scan(&app).await;
    *scanning.0.lock().unwrap() = false;
    r
}

async fn scan(app: &AppHandle) -> Result<ScanResult> {
    let cfg = config::load()?;
    let emit = |stage: &str, detail: String, done: usize, total: usize| {
        let _ = app.emit("inbox-event", ScanEvent { stage: stage.into(), detail, done, total });
    };

    emit("reading", "asking Mail for Handshake emails".into(), 0, 0);
    let mut emails = from_drop_folder();
    let mut source = if emails.is_empty() { String::new() } else { "drop folder".to_string() };
    let mut warning = None;
    match from_mail_app(cfg.inbox_days, &cfg.inbox_sender_match).await {
        Ok(m) => {
            source = if source.is_empty() { "Mail".into() } else { format!("Mail + {source}") };
            emails.extend(m);
        }
        Err(e) => warning = Some(e),
    }

    let mut store = load_store();
    let fresh: Vec<Email> = emails.iter().filter(|e| !store.seen.contains_key(&e.id)).cloned().collect();
    let total = fresh.len();
    let mut added = Vec::new();
    for (i, e) in fresh.iter().enumerate() {
        emit("extracting", clip(&e.subject, 90), i, total);
        match extract(&cfg.ollama_url, &cfg.research_model, e).await {
            Ok(items) => added.extend(items),
            Err(err) => {
                // Leave it unseen so the next scan retries it.
                emit("error", format!("{}: {err}", clip(&e.subject, 60)), i, total);
                continue;
            }
        }
        store.seen.insert(e.id.clone(), chrono::Local::now().to_rfc3339());
    }
    added.retain(|o| !store.items.iter().any(|x| x.id == o.id));
    emit("scoring", format!("{} opportunities", added.len()), total, total);
    if let Err(e) = score(&cfg.ollama_url, &cfg.research_model, &cfg.career_profile, &mut added).await {
        warning = Some(format!("scoring failed: {e}"));
    }
    let new_items = added.len();
    store.items.extend(added);
    store.last_scan = Some(chrono::Local::now().to_rfc3339());
    store.last_source = source.clone();
    save_store(&store)?;
    emit("done", format!("{new_items} new"), total, total);
    Ok(ScanResult { emails: emails.len(), new_emails: total, new_items, source, warning })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Feed {
    pub items: Vec<Opportunity>,
    last_scan: Option<String>,
    last_source: String,
    drop_dir: String,
}

pub fn find_opportunity(id: &str) -> Option<Opportunity> {
    load_store().items.into_iter().find(|o| o.id == id)
}

#[tauri::command]
pub fn opportunities_get() -> Result<Feed> {
    let s = load_store();
    let mut items = s.items;
    items.sort_by(|a, b| b.score.cmp(&a.score).then(b.received.cmp(&a.received)));
    Ok(Feed { items, last_scan: s.last_scan, last_source: s.last_source, drop_dir: drop_dir().display().to_string() })
}

#[tauri::command]
pub fn opportunity_set_status(id: String, status: String) -> Result<()> {
    if !["new", "saved", "dismissed", "added"].contains(&status.as_str()) {
        return Err(Error::msg("bad status"));
    }
    let mut s = load_store();
    let o = s.items.iter_mut().find(|o| o.id == id).ok_or_else(|| Error::msg("not found"))?;
    o.status = status;
    save_store(&s)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALERT: &str = include_str!("../tests/fixtures/handshake-alert.eml");

    #[test]
    fn parses_handshake_alert() {
        let e = parse_email(ALERT.as_bytes(), "x").unwrap();
        assert_eq!(e.subject, "3 new jobs match your preferences");
        assert!(e.text.contains("Software Engineering Intern"));
        assert!(e.links.iter().any(|(t, h)| t.contains("View job") && h.starts_with("https://")));
        assert!(!e.links.iter().any(|(_, h)| h.contains("unsubscribe")), "unsubscribe links are dropped");
    }

    #[test]
    fn grounding_rejects_invented_employers() {
        let e = parse_email(ALERT.as_bytes(), "x").unwrap();
        assert!(grounded("Northwind Robotics", &e));
        assert!(!grounded("Google", &e));
    }

    /// Live: needs Ollama. cargo test extracts_live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn extracts_live() {
        let cfg = config::load().unwrap();
        let e = parse_email(ALERT.as_bytes(), "x").unwrap();
        let mut items = extract(&cfg.ollama_url, &cfg.research_model, &e).await.unwrap();
        score(&cfg.ollama_url, &cfg.research_model, &cfg.career_profile, &mut items).await.unwrap();
        for o in &items {
            println!("{:>3} [{}] {} — {} | {} | {} | eligible:{} | {}\n     link: {}\n     why: {}",
                o.score, o.kind, o.title, o.employer, o.location, o.pay, o.eligible, o.deadline, o.link, o.reasons);
        }
        assert!(items.len() >= 2, "expected the alert's jobs, got {}", items.len());
        assert!(items.iter().all(|o| o.link.is_empty() || o.link.starts_with("https://")));
        let nw = items.iter().find(|o| o.employer.contains("Northwind")).expect("Northwind item");
        assert_eq!(nw.kind, "internship");
        assert!(nw.pay.contains("48"), "pay: {:?}", nw.pay);
        assert!(nw.location.contains("San Francisco"), "location: {:?}", nw.location);
        assert!(nw.score >= 70, "the strong fit should rank high, got {}", nw.score);
        let lumen = items.iter().find(|o| o.employer.contains("Lumen")).expect("Lumen item");
        assert_eq!(lumen.kind, "job", "a new-grad full-time role is not an internship");
        let bf = items.iter().find(|o| o.employer.contains("Bluefin")).expect("Bluefin item");
        assert!(bf.score < 40, "unpaid non-technical should rank low, got {}", bf.score);
    }
}
