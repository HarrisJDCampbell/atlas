//! First-run config, written to ~/.config/atlas/config.json. Edit that file, not this one.

use crate::config::{AgentCfg, AgentModels, Config, LauncherCfg, ProjectCfg, RevenueCfg, SentryCfg};

fn project(id: &str, name: &str, path: &str, accent: &str, tagline: &str) -> ProjectCfg {
    ProjectCfg {
        id: id.into(),
        name: name.into(),
        path: path.into(),
        accent: accent.into(),
        tagline: tagline.into(),
        ..Default::default()
    }
}

#[allow(clippy::too_many_arguments)]
fn l(id: &str, name: &str, kind: &str, target: &str, mode: &str, key: &str, favorite: Option<u8>, group: &str) -> LauncherCfg {
    LauncherCfg {
        id: id.into(),
        name: name.into(),
        kind: kind.into(),
        target: target.into(),
        mode: mode.into(),
        key: key.into(),
        favorite,
        group: group.into(),
    }
}

/// A starter set: common tools for school, building, shipping and job hunting.
/// Letters fire inside their mode. Edit the list in config.json to make it yours.
fn launchers() -> Vec<LauncherCfg> {
    vec![
        // ── school ─────────────────────────────────────────────
        l("lms", "Canvas", "url", "https://canvas.instructure.com/", "school", "i", Some(1), "Class"),
        l("school-mail", "School mail", "url", "https://outlook.office.com/mail/", "school", "m", Some(2), "Class"),
        l("gcal", "Calendar", "url", "https://calendar.google.com/", "school", "c", None, "Class"),
        l("gdocs", "Docs", "url", "https://docs.google.com/", "school", "d", Some(3), "Write"),
        l("gsheets", "Sheets", "url", "https://sheets.google.com/", "school", "s", None, "Write"),
        l("gslides", "Slides", "url", "https://slides.google.com/", "school", "l", None, "Write"),
        l("gdrive", "Drive", "url", "https://drive.google.com/", "school", "r", None, "Write"),
        l("notion", "Notion", "app", "Notion", "school", "n", None, "Write"),
        l("zoom", "Zoom", "app", "zoom.us", "school", "z", None, "Class"),
        l("semester", "Semester folder", "folder", "~/School", "school", "f", None, "Files"),
        // ── build ──────────────────────────────────────────────
        l("github", "GitHub", "url", "https://github.com/", "build", "g", Some(4), "Code"),
        l("pulls", "Pull requests", "url", "https://github.com/pulls", "build", "p", None, "Code"),
        l("cursor-atlas", "Atlas", "editor", "~/Developer/atlas", "build", "a", Some(5), "Open in editor"),
        l("terminal", "Terminal", "app", "Terminal", "build", "t", None, "Tools"),
        l("xcode", "Xcode", "app", "Xcode", "build", "x", None, "Tools"),
        l("docker", "Docker", "app", "Docker", "build", "k", None, "Tools"),
        // ── ops ────────────────────────────────────────────────
        l("sentry", "Sentry", "url", "https://sentry.io/", "ops", "e", Some(6), "Monitor"),
        l("railway", "Railway", "url", "https://railway.com/dashboard", "ops", "r", None, "Infra"),
        l("supabase", "Supabase", "url", "https://supabase.com/dashboard/projects", "ops", "s", None, "Infra"),
        l("asc", "App Store Connect", "url", "https://appstoreconnect.apple.com/", "ops", "a", None, "Ship"),
        l("expo", "Expo", "url", "https://expo.dev/", "ops", "x", None, "Ship"),
        l("revenuecat", "RevenueCat", "url", "https://app.revenuecat.com/", "ops", "c", None, "Money"),
        // ── career ─────────────────────────────────────────────
        l("linkedin", "LinkedIn", "url", "https://www.linkedin.com/feed/", "career", "l", Some(7), "Network"),
        l("linkedin-jobs", "LinkedIn Jobs", "url", "https://www.linkedin.com/jobs/", "career", "j", None, "Apply"),
        l("handshake", "Handshake", "url", "https://app.joinhandshake.com/", "career", "h", None, "Apply"),
        l("simplify", "Simplify", "url", "https://simplify.jobs/", "career", "s", None, "Apply"),
        l("levels", "Levels.fyi interns", "url", "https://www.levels.fyi/internships/", "career", "v", None, "Apply"),
        l("apple-mail", "Mail", "app", "Mail", "career", "m", None, "Inbox"),
        l("career-folder", "Career folder", "folder", "~/Documents", "career", "f", None, "Files"),
        // ── create ─────────────────────────────────────────────
        l("tiktok", "TikTok Studio", "url", "https://www.tiktok.com/tiktokstudio", "create", "t", None, "Publish"),
        l("youtube-studio", "YouTube Studio", "url", "https://studio.youtube.com/", "create", "y", None, "Publish"),
        l("instagram", "Instagram", "url", "https://www.instagram.com/", "create", "i", None, "Publish"),
        l("metricool", "Metricool", "url", "https://app.metricool.com/", "create", "e", None, "Publish"),
        l("spotify", "Spotify", "app", "Spotify", "create", "s", Some(9), "Vibe"),
        // ── flows ──────────────────────────────────────────────
        l("n8n", "n8n editor", "url", "http://localhost:5678/", "flows", "n", None, "Automation"),
        // ── code ───────────────────────────────────────────────
        l("leetcode", "LeetCode", "url", "https://leetcode.com/problemset/", "code", "l", None, "Practice"),
        l("neetcode", "NeetCode roadmap", "url", "https://neetcode.io/roadmap", "code", "n", None, "Practice"),
        l("coderpad", "CoderPad sandbox", "url", "https://app.coderpad.io/sandbox", "code", "c", None, "Practice"),
        l("javadoc", "Java 17 API", "url", "https://docs.oracle.com/en/java/javase/17/docs/api/index.html", "code", "j", None, "Reference"),
        l("bigo", "Big-O cheat sheet", "url", "https://www.bigocheatsheet.com/", "code", "b", None, "Reference"),
        l("interview-prep", "interview-prep", "editor", "~/Developer/interview-prep", "code", "i", None, "Your notes"),
        // ── ai ─────────────────────────────────────────────────
        l("chatgpt", "ChatGPT", "url", "https://chatgpt.com/", "ai", "g", Some(8), "Assistants"),
        l("ollama", "Ollama", "app", "Ollama", "ai", "o", None, "Local"),
    ]
}

const CAREER_PROFILE: &str = "Describe yourself for the inbox agent: year, major, school, graduation date, \
the roles and seasons you're looking for, where you'd work, your strongest projects and the stack behind them, \
and what you're not interested in. The inbox agent scores every opportunity against this text.";

const HOUSE_STYLE: &str = "Be direct and concrete. Explain the reasoning behind non-obvious choices and name the \
alternative you rejected. Say plainly when something is wrong or unknown — never invent file names, \
APIs, numbers or project state that are not in the context you were given.";

pub fn config() -> Config {
    let atlas = project("atlas", "Atlas", "~/Developer/atlas", "#d55181", "This cockpit");
    let all: Vec<String> = vec!["atlas".into()];

    Config {
        profile: Default::default(),
        summon_hotkey: "Control+Alt+Space".into(),
        editor_app: "Cursor".into(),
        courses_file: "~/.config/atlas/courses.conf".into(),
        school_root: "~/School".into(),
        launchers: launchers(),
        agent_models: AgentModels::default(),
        research_model: "qwen3:14b".into(),
        search_url: "http://127.0.0.1:8888".into(),
        career_profile: CAREER_PROFILE.into(),
        n8n_url: "http://127.0.0.1:5678".into(),
        api_port: 47321,
        inbox_days: 45,
        inbox_sender_match: "handshake".into(),
        ollama_url: "http://127.0.0.1:11434".into(),
        projects: vec![atlas],
        sentry: SentryCfg { base_url: "https://sentry.io".into(), org: String::new() },
        revenue: RevenueCfg { source: "none".into(), revenuecat_project_id: String::new(), currency: "USD".into() },
        health_checks: vec![],
        agents: vec![
            AgentCfg {
                id: "chief".into(),
                name: "Chief of Staff".into(),
                role: "Plans the week across school and every project".into(),
                model: "qwen3:14b".into(),
                system: format!(
                    "{HOUSE_STYLE}\n\nYou are their chief of staff. Turn the project state below into a short, \
                     ordered plan against their priorities. Prefer finishing over starting."
                ),
                context_projects: all.clone(),
                context_files: vec!["~/.config/atlas/courses.conf".into()],
                think: false,
                num_ctx: 24576,
            },
            AgentCfg {
                id: "ops".into(),
                name: "Production Engineer".into(),
                role: "Keeps the live product healthy".into(),
                model: "qwen3:14b".into(),
                system: format!(
                    "{HOUSE_STYLE}\n\nYou are a senior engineer on a live product with real users. Treat anything \
                     touching payments, entitlements or production data as high-risk: say what could break before \
                     suggesting the change."
                ),
                context_projects: all.clone(),
                think: false,
                num_ctx: 16384,
                ..Default::default()
            },
            AgentCfg {
                id: "interview".into(),
                name: "Interview Coach".into(),
                role: "Drills system design on your own projects".into(),
                model: "qwen3:14b".into(),
                system: format!(
                    "{HOUSE_STYLE}\n\nYou are a tough but fair SWE interviewer. Ask one question at a time about the \
                     architecture, trade-offs and failure modes of their real projects below. After each answer, grade \
                     it, say what a strong answer adds, then ask the next question. Mix in data structures and \
                     complexity where the code invites it."
                ),
                context_projects: all,
                think: true,
                num_ctx: 16384,
                ..Default::default()
            },
            AgentCfg {
                id: "quick".into(),
                name: "Quick".into(),
                role: "Fast answers, no project context".into(),
                model: "qwen3:8b".into(),
                system: HOUSE_STYLE.into(),
                think: false,
                num_ctx: 8192,
                ..Default::default()
            },
        ],
    }
}
