//! Sentry health: unresolved issues and crash-free session rate per project.

use crate::config;
use crate::error::{Error, Result};
use crate::secrets;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentryOverview {
    connected: bool,
    /// Why it isn't connected, in words the UI can show as-is.
    reason: Option<String>,
    org: String,
    projects: Vec<SentryProject>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentryProject {
    slug: String,
    owner: Option<String>,
    unresolved: u64,
    top_events_24h: u64,
    crash_free_rate: Option<f64>,
    /// Daily crash-free rate over 14 days, oldest first.
    crash_free_series: Vec<Option<f64>>,
    issues: Vec<Issue>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    short_id: String,
    title: String,
    culprit: String,
    level: String,
    count: u64,
    user_count: u64,
    last_seen: String,
    permalink: String,
}

struct Api {
    client: reqwest::Client,
    base: String,
    token: String,
}

impl Api {
    async fn get(&self, path: &str, query: &[(&str, String)]) -> Result<(Value, Option<u64>)> {
        let resp = self
            .client
            .get(format!("{}/api/0{path}", self.base))
            .bearer_auth(&self.token)
            .query(query)
            .send()
            .await?;
        let status = resp.status();
        let hits = resp
            .headers()
            .get("x-hits")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.parse().ok());
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| v["detail"].as_str().map(String::from))
                .unwrap_or(body);
            return Err(Error::msg(format!("Sentry {status}: {detail}")));
        }
        Ok((resp.json().await?, hits))
    }
}

fn num(v: &Value) -> u64 {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())).unwrap_or(0)
}

async fn project(api: &Api, org: &str, slug: &str, id: &str, owner: Option<String>) -> SentryProject {
    let issues_q = [
        ("project", id.to_string()),
        ("query", "is:unresolved".to_string()),
        ("statsPeriod", "24h".to_string()),
        ("sort", "freq".to_string()),
        ("limit", "8".to_string()),
    ];
    let sessions_q = [
        ("project", id.to_string()),
        ("field", "crash_free_rate(session)".to_string()),
        ("statsPeriod", "14d".to_string()),
        ("interval", "1d".to_string()),
    ];
    let issues_path = format!("/organizations/{org}/issues/");
    let sessions_path = format!("/organizations/{org}/sessions/");
    let (issues, sessions) = tokio::join!(api.get(&issues_path, &issues_q), api.get(&sessions_path, &sessions_q));

    let mut out = SentryProject {
        slug: slug.to_string(),
        owner,
        unresolved: 0,
        top_events_24h: 0,
        crash_free_rate: None,
        crash_free_series: vec![],
        issues: vec![],
        error: None,
    };

    match issues {
        Ok((v, hits)) => {
            let list = v.as_array().cloned().unwrap_or_default();
            out.unresolved = hits.unwrap_or(list.len() as u64);
            // `count` on each issue is scoped to statsPeriod (24h) when statsPeriod is set.
            out.top_events_24h = list.iter().map(|i| num(&i["count"])).sum();
            out.issues = list
                .iter()
                .map(|i| Issue {
                    short_id: i["shortId"].as_str().unwrap_or("").into(),
                    title: i["title"].as_str().unwrap_or("").into(),
                    culprit: i["culprit"].as_str().unwrap_or("").into(),
                    level: i["level"].as_str().unwrap_or("error").into(),
                    count: num(&i["count"]),
                    user_count: num(&i["userCount"]),
                    last_seen: i["lastSeen"].as_str().unwrap_or("").into(),
                    permalink: i["permalink"].as_str().unwrap_or("").into(),
                })
                .collect();
        }
        Err(e) => out.error = Some(e.to_string()),
    }

    // Crash-free rate only exists for projects sending release health (sessions).
    // Apps without it just show no gauge; that is not an error worth surfacing.
    if let Ok((v, _)) = sessions {
        let g = &v["groups"][0];
        let field = "crash_free_rate(session)";
        out.crash_free_rate = g["totals"][field].as_f64();
        out.crash_free_series = g["series"][field]
            .as_array()
            .map(|a| a.iter().map(Value::as_f64).collect())
            .unwrap_or_default();
    }
    out
}

#[tauri::command]
pub async fn sentry_overview() -> Result<SentryOverview> {
    let cfg = config::load()?;
    let org = cfg.sentry.org.clone();
    let not_connected = |reason: &str| SentryOverview {
        connected: false,
        reason: Some(reason.to_string()),
        org: org.clone(),
        projects: vec![],
    };
    if org.is_empty() {
        return Ok(not_connected("Set sentry.org in the config file."));
    }
    let Some(token) = secrets::get("sentry_token")? else {
        return Ok(not_connected("Add a Sentry auth token in Settings."));
    };
    let api = Api {
        client: reqwest::Client::new(),
        base: cfg.sentry.base_url.trim_end_matches('/').to_string(),
        token,
    };

    let (list, _) = api.get(&format!("/organizations/{org}/projects/"), &[]).await?;
    let ids: HashMap<String, String> = list
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|p| Some((p["slug"].as_str()?.to_string(), p["id"].as_str()?.to_string())))
        .collect();

    // Configured slugs, attributed to the Atlas project that claims them.
    let mut wanted: Vec<(String, Option<String>)> = cfg
        .projects
        .iter()
        .flat_map(|p| p.sentry_projects.iter().map(move |s| (s.clone(), Some(p.name.clone()))))
        .collect();
    if wanted.is_empty() {
        wanted = ids.keys().map(|s| (s.clone(), None)).collect();
        wanted.sort();
    }

    let futs = wanted.iter().map(|(slug, owner)| {
        let api = &api;
        let org = &org;
        let ids = &ids;
        async move {
            match ids.get(slug) {
                Some(id) => project(api, org, slug, id, owner.clone()).await,
                None => SentryProject {
                    slug: slug.clone(),
                    owner: owner.clone(),
                    unresolved: 0,
                    top_events_24h: 0,
                    crash_free_rate: None,
                    crash_free_series: vec![],
                    issues: vec![],
                    error: Some(format!("No project '{slug}' in org '{org}' visible to this token")),
                },
            }
        }
    });
    let projects = futures_util::future::join_all(futs).await;
    Ok(SentryOverview { connected: true, reason: None, org, projects })
}
