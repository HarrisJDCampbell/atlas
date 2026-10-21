//! Revenue from RevenueCat, and production health pings.
//!
//! VisBets stores tiers in Supabase but no prices or transactions, so RevenueCat is
//! the only source that knows what money actually came in.

use crate::config;
use crate::error::{Error, Result};
use crate::secrets;
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevenueOverview {
    connected: bool,
    reason: Option<String>,
    currency: String,
    metrics: Vec<Metric>,
    fetched_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    id: String,
    name: String,
    description: String,
    value: f64,
    unit: String,
    period: String,
}

#[tauri::command]
pub async fn revenue_overview() -> Result<RevenueOverview> {
    let cfg = config::load()?.revenue;
    let currency = if cfg.currency.is_empty() { "USD".to_string() } else { cfg.currency.clone() };
    let fetched_at = chrono::Local::now().to_rfc3339();
    let off = |reason: &str| RevenueOverview {
        connected: false,
        reason: Some(reason.into()),
        currency: currency.clone(),
        metrics: vec![],
        fetched_at: fetched_at.clone(),
    };

    if cfg.source != "revenuecat" {
        return Ok(off("No revenue source configured."));
    }
    if cfg.revenuecat_project_id.is_empty() {
        return Ok(off("Set revenue.revenuecat_project_id (RevenueCat → Project settings)."));
    }
    let Some(key) = secrets::get("revenuecat_key")? else {
        return Ok(off("Add a RevenueCat v2 secret key in Settings."));
    };

    let url = format!(
        "https://api.revenuecat.com/v2/projects/{}/metrics/overview",
        cfg.revenuecat_project_id
    );
    let resp = reqwest::Client::new()
        .get(url)
        .bearer_auth(key)
        .query(&[("currency", &currency)])
        .send()
        .await?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("request failed");
        return Err(Error::msg(format!("RevenueCat {status}: {msg}")));
    }

    let metrics = body["metrics"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| {
            Some(Metric {
                id: m["id"].as_str()?.into(),
                name: m["name"].as_str().unwrap_or("").into(),
                description: m["description"].as_str().unwrap_or("").into(),
                value: m["value"].as_f64()?,
                unit: m["unit"].as_str().unwrap_or("").into(),
                period: m["period"].as_str().unwrap_or("").into(),
            })
        })
        .collect();

    Ok(RevenueOverview { connected: true, reason: None, currency, metrics, fetched_at })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResult {
    name: String,
    url: String,
    ok: bool,
    status: Option<u16>,
    latency_ms: u64,
    error: Option<String>,
}

#[tauri::command]
pub async fn health_checks() -> Result<Vec<HealthResult>> {
    let checks = config::load()?.health_checks;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(8)).build()?;
    let futs = checks.into_iter().map(|c| {
        let client = client.clone();
        async move {
            let start = Instant::now();
            let r = client.get(&c.url).send().await;
            let latency_ms = start.elapsed().as_millis() as u64;
            match r {
                Ok(resp) => HealthResult {
                    ok: resp.status().is_success(),
                    status: Some(resp.status().as_u16()),
                    name: c.name,
                    url: c.url,
                    latency_ms,
                    error: None,
                },
                Err(e) => HealthResult {
                    ok: false,
                    status: None,
                    name: c.name,
                    url: c.url,
                    latency_ms,
                    error: Some(if e.is_timeout() { "timed out".into() } else { "unreachable".into() }),
                },
            }
        }
    });
    Ok(futures_util::future::join_all(futs).await)
}
