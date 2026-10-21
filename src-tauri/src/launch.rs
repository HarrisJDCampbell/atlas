//! Launchers: open URLs, apps, folders and repos — by configured id only.
//!
//! The webview sends an id; Rust looks the target up in config and runs `open`
//! with argv (no shell), so nothing the UI sends can become a command.

use crate::config::{self, LauncherCfg};
use crate::error::{Error, Result};
use base64::Engine;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

fn find(id: &str) -> Result<(LauncherCfg, String)> {
    let cfg = config::load()?;
    let l = cfg
        .launchers
        .iter()
        .find(|l| l.id == id)
        .cloned()
        .ok_or_else(|| Error::msg(format!("unknown launcher '{id}'")))?;
    Ok((l, cfg.editor_app))
}

#[tauri::command]
pub fn launch(id: String) -> Result<()> {
    let (l, editor) = find(&id)?;
    let mut cmd = Command::new("/usr/bin/open");
    match l.kind.as_str() {
        "url" => {
            if !(l.target.starts_with("https://") || l.target.starts_with("http://")) {
                return Err(Error::msg(format!("{}: only http(s) URLs can be opened", l.name)));
            }
            cmd.arg(&l.target);
        }
        "app" => {
            cmd.args(["-a", &l.target]);
        }
        "folder" | "file" => {
            cmd.arg(config::expand(&l.target));
        }
        "editor" => {
            cmd.args(["-a", &editor]).arg(config::expand(&l.target));
        }
        other => return Err(Error::msg(format!("unknown launcher kind '{other}'"))),
    }
    let out = cmd.output()?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let err = err.lines().next().unwrap_or("failed").trim();
        return Err(Error::msg(format!("{}: {err}", l.name)));
    }
    Ok(())
}

fn cache_dir() -> PathBuf {
    dirs::cache_dir().unwrap_or_else(std::env::temp_dir).join("com.harriscampbell.atlas/icons")
}

fn app_bundle(name: &str) -> Option<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    [
        PathBuf::from("/Applications"),
        home.join("Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ]
    .into_iter()
    .map(|d| d.join(format!("{name}.app")))
    .find(|p| p.exists())
}

/// Renders an app's .icns to a 128px PNG with `sips`.
fn app_icon_png(bundle: &Path, out: &Path) -> Option<()> {
    let plist = bundle.join("Contents/Info.plist");
    let resources = bundle.join("Contents/Resources");
    let declared = Command::new("/usr/bin/plutil")
        .args(["-extract", "CFBundleIconFile", "raw", "-o", "-"])
        .arg(&plist)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .map(|n| resources.join(if n.ends_with(".icns") { n } else { format!("{n}.icns") }))
        .filter(|p| p.exists());
    // Apps that only declare an asset-catalog icon usually still ship an .icns.
    let icns = declared.or_else(|| {
        std::fs::read_dir(&resources).ok()?.filter_map(|e| e.ok()).map(|e| e.path())
            .find(|p| p.extension().is_some_and(|x| x == "icns"))
    })?;
    let ok = Command::new("/usr/bin/sips")
        .args(["-s", "format", "png", "-Z", "128"])
        .arg(&icns)
        .arg("--out")
        .arg(out)
        .output()
        .ok()?
        .status
        .success();
    ok.then_some(())
}

async fn site_icon(url: &str) -> Option<(Vec<u8>, &'static str)> {
    let host = url.split("://").nth(1)?.split('/').next()?.to_string();
    let client = reqwest::Client::builder().timeout(Duration::from_secs(6)).build().ok()?;
    // A site's own touch icon is crisp at 180px; fall back to DuckDuckGo's favicon proxy.
    // Dashboards often live on subdomains (us.sentry.io, app.metricool.com) with no
    // icon of their own, so also try the parent domain.
    let parent = host.split_once('.').map(|(_, p)| p).filter(|p| p.contains('.')).map(str::to_string);
    let mut tries = vec![
        (format!("https://{host}/apple-touch-icon.png"), "image/png"),
        (format!("https://icons.duckduckgo.com/ip3/{host}.ico"), "image/x-icon"),
    ];
    if let Some(p) = parent {
        tries.push((format!("https://{p}/apple-touch-icon.png"), "image/png"));
        tries.push((format!("https://icons.duckduckgo.com/ip3/{p}.ico"), "image/x-icon"));
    }
    for (u, mime) in tries {
        let Ok(r) = client.get(&u).send().await else { continue };
        let is_image = r
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|c| c.starts_with("image/"));
        if r.status().is_success() && is_image
            && let Ok(b) = r.bytes().await
            && b.len() > 200
        {
            return Some((b.to_vec(), mime));
        }
    }
    None
}

/// Icon for a launcher as a data: URL, cached on disk. None means "draw a monogram".
#[tauri::command]
pub async fn launcher_icon(id: String) -> Result<Option<String>> {
    let (l, editor) = find(&id)?;
    let source = match l.kind.as_str() {
        "editor" => format!("app:{editor}"),
        "app" => format!("app:{}", l.target),
        "url" => format!("url:{}", l.target),
        _ => return Ok(None),
    };
    let mut h = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut h);
    let dir = cache_dir();
    std::fs::create_dir_all(&dir)?;
    let png = dir.join(format!("{:x}.png", h.finish()));
    let ico = dir.join(format!("{:x}.ico", h.finish()));
    let miss = dir.join(format!("{:x}.none", h.finish()));

    let encode = |bytes: Vec<u8>, mime: &str| format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes));
    if let Ok(b) = std::fs::read(&png) {
        return Ok(Some(encode(b, "image/png")));
    }
    if let Ok(b) = std::fs::read(&ico) {
        return Ok(Some(encode(b, "image/x-icon")));
    }
    if miss.exists() {
        return Ok(None);
    }

    let found = if let Some(app) = source.strip_prefix("app:") {
        let app = app.to_string();
        let out = png.clone();
        tokio::task::spawn_blocking(move || app_bundle(&app).and_then(|b| app_icon_png(&b, &out)))
            .await
            .ok()
            .flatten()
            .and_then(|_| std::fs::read(&png).ok())
            .map(|b| (b, "image/png"))
    } else {
        let got = site_icon(&l.target).await;
        if let Some((b, mime)) = &got {
            std::fs::write(if *mime == "image/png" { &png } else { &ico }, b)?;
        }
        got
    };
    match found {
        Some((b, mime)) => Ok(Some(encode(b, mime))),
        None => {
            std::fs::write(&miss, b"")?;
            Ok(None)
        }
    }
}
