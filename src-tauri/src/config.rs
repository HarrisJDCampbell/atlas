//! User-editable config at ~/.config/atlas/config.json.
//!
//! Everything Atlas shows (projects, Sentry projects, agents, revenue source) is
//! declared here, so changing the cockpit is editing JSON, not recompiling.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Config {
    /// Who Atlas works for. Every agent prompt is written from this.
    pub profile: Profile,
    /// System-wide shortcut that shows/hides Atlas, e.g. "Control+Alt+Space".
    pub summon_hotkey: String,
    /// App used for "editor" launchers.
    pub editor_app: String,
    pub courses_file: String,
    pub school_root: String,
    pub launchers: Vec<LauncherCfg>,
    /// Models per agent role: smaller scope, smaller model.
    pub agent_models: AgentModels,
    /// Model the research swarm runs on (must support tool calling).
    pub research_model: String,
    /// Local SearXNG instance the research agents search through.
    pub search_url: String,
    /// Local n8n instance Atlas drives (and is driven by).
    pub n8n_url: String,
    /// Port of Atlas's own local API (127.0.0.1 only, token required).
    pub api_port: u16,
    /// Who the inbox agent ranks opportunities for. Edit freely.
    pub career_profile: String,
    pub inbox_days: u32,
    /// Substring of the sender address that marks an email as Handshake's.
    pub inbox_sender_match: String,
    pub ollama_url: String,
    pub projects: Vec<ProjectCfg>,
    pub sentry: SentryCfg,
    pub revenue: RevenueCfg,
    pub health_checks: Vec<HealthCheck>,
    pub agents: Vec<AgentCfg>,
}

/// The person Atlas works for, as the agents should describe them.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Profile {
    /// Full name, e.g. "Alex Rivera". Empty means "the user".
    pub name: String,
    /// One line, completing "…, {about}", e.g. "a CS student who builds and ships real software".
    pub about: String,
    /// School or org, used for labels like the School world, e.g. "State University".
    pub school: String,
    /// The current term, e.g. "Fall 2026".
    pub term: String,
    /// What matters most, in order. The orchestrator and chief of staff plan against it.
    pub priorities: String,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            name: String::new(),
            about: "a student who builds and ships real software".into(),
            school: String::new(),
            term: String::new(),
            priorities: "ship the projects that matter, keep grades strong, get genuinely good at programming".into(),
        }
    }
}

impl Profile {
    /// "Alex Rivera", or "the user" when no name is set.
    pub fn who(&self) -> String {
        if self.name.trim().is_empty() { "the user".into() } else { self.name.trim().into() }
    }
    /// "Alex", or "the user".
    pub fn first(&self) -> String {
        self.name.split_whitespace().next().map(String::from).unwrap_or_else(|| "the user".into())
    }
    /// "Alex's", or "the user's".
    pub fn possessive(&self) -> String {
        format!("{}'s", self.first())
    }
}

/// One thing Atlas can open. The webview can only trigger these by id — it can
/// never hand Rust an arbitrary command or path.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct LauncherCfg {
    pub id: String,
    pub name: String,
    /// "url" | "app" | "folder" | "file" | "editor"
    pub kind: String,
    /// URL, app name, or path depending on kind.
    pub target: String,
    /// Mode this tool lives in: command, school, build, ops, career, create, ai.
    pub mode: String,
    /// Single key that fires it while that mode is open.
    pub key: String,
    /// 1-9: also fires from every mode with that number key.
    pub favorite: Option<u8>,
    pub group: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct AgentModels {
    pub orchestrator: String,
    pub project: String,
    pub directory: String,
}

impl Default for AgentModels {
    fn default() -> Self {
        Self { orchestrator: "qwen3:14b".into(), project: "qwen3:14b".into(), directory: "qwen3:8b".into() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct HealthCheck {
    pub name: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct ProjectCfg {
    pub id: String,
    pub name: String,
    pub path: String,
    /// Markdown checklist that drives the progress bars. Relative to `path`.
    /// When empty, Atlas looks for ROADMAP.md, TODO.md, PLAN.md, docs/ROADMAP.md.
    pub roadmap: String,
    /// Sentry project slug(s) belonging to this project.
    pub sentry_projects: Vec<String>,
    pub accent: String,
    pub tagline: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct SentryCfg {
    pub base_url: String,
    pub org: String,
}

impl Default for SentryCfg {
    fn default() -> Self {
        Self { base_url: "https://sentry.io".into(), org: String::new() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct RevenueCfg {
    /// "revenuecat" | "none"
    pub source: String,
    pub revenuecat_project_id: String,
    pub currency: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct AgentCfg {
    pub id: String,
    pub name: String,
    pub role: String,
    pub model: String,
    pub system: String,
    /// Project ids whose README, roadmap and recent commits are injected as context.
    pub context_projects: Vec<String>,
    /// Extra files injected verbatim (e.g. the course schedule).
    pub context_files: Vec<String>,
    pub think: bool,
    pub num_ctx: u32,
}

impl Default for Config {
    fn default() -> Self {
        crate::defaults::config()
    }
}

pub fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".config/atlas/config.json")
}

pub fn expand(p: &str) -> PathBuf {
    match p.strip_prefix("~/") {
        Some(rest) => dirs::home_dir().unwrap_or_default().join(rest),
        None => PathBuf::from(p),
    }
}

/// Reads the config, writing the defaults on first run so there is always a file to edit.
pub fn load() -> Result<Config> {
    let path = config_path();
    if !path.exists() {
        save(&Config::default(), &path)?;
    }
    let raw = std::fs::read_to_string(&path)?;
    let cfg: Config = serde_json::from_str(&raw)
        .map_err(|e| Error::msg(format!("{} is invalid JSON: {e}", path.display())))?;
    // Keys added in newer versions get their defaults via #[serde(default)]; write
    // them back once so the file always shows every option there is to edit.
    let on_disk: serde_json::Value = serde_json::from_str(&raw)?;
    let full = serde_json::to_value(&cfg)?;
    let missing = full.as_object().is_some_and(|f| f.keys().any(|k| on_disk.get(k).is_none()));
    if missing {
        save(&cfg, &path)?;
    }
    Ok(cfg)
}

fn save(cfg: &Config, path: &Path) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(cfg)?)?;
    Ok(())
}

#[derive(Serialize)]
pub struct ConfigInfo {
    path: String,
    config: Config,
}

#[tauri::command]
pub fn config_get() -> Result<ConfigInfo> {
    Ok(ConfigInfo { path: config_path().display().to_string(), config: load()? })
}

#[tauri::command]
pub fn config_set(config: Config) -> Result<()> {
    save(&config, &config_path())
}
