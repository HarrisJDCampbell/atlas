//! API keys live in the macOS Keychain, never in a file and never in the webview.
//!
//! The frontend can set, clear, and ask "is this configured?" — it can never read a
//! value back. Every outbound API call happens in Rust, which reads the key here.

use crate::error::{Error, Result};
use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "com.harriscampbell.atlas";

/// The only secret names the UI is allowed to touch.
pub const KNOWN: &[(&str, &str)] = &[
    ("sentry_token", "Sentry auth token (org:read, project:read, event:read)"),
    ("revenuecat_key", "RevenueCat secret API key (v2, read-only)"),
    ("n8n_api_key", "n8n API key (n8n → Settings → n8n API)"),
];

fn entry(name: &str) -> Result<Entry> {
    if !KNOWN.iter().any(|(k, _)| *k == name) {
        return Err(Error::msg(format!("unknown secret '{name}'")));
    }
    Ok(Entry::new(SERVICE, name)?)
}

pub fn get(name: &str) -> Result<Option<String>> {
    match entry(name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[derive(Serialize)]
pub struct SecretStatus {
    name: &'static str,
    label: &'static str,
    configured: bool,
}

#[tauri::command]
pub fn secret_status() -> Result<Vec<SecretStatus>> {
    KNOWN
        .iter()
        .map(|(name, label)| {
            Ok(SecretStatus { name, label, configured: get(name)?.is_some() })
        })
        .collect()
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<()> {
    let value = value.trim();
    if value.is_empty() {
        return Err(Error::msg("empty value"));
    }
    entry(&name)?.set_password(value)?;
    Ok(())
}

#[tauri::command]
pub fn secret_clear(name: String) -> Result<()> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
