//! Internship pipeline, stored as plain JSON next to the config so it's yours to
//! edit, back up, or grep.

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Application {
    pub id: String,
    pub company: String,
    pub role: String,
    /// wishlist | applied | oa | interview | offer | rejected
    pub stage: String,
    pub link: String,
    pub note: String,
    pub updated: String,
}

fn path() -> PathBuf {
    crate::config::config_path().with_file_name("applications.json")
}

#[tauri::command]
pub fn applications_get() -> Result<Vec<Application>> {
    match std::fs::read_to_string(path()) {
        Ok(raw) => Ok(serde_json::from_str(&raw)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub fn applications_set(apps: Vec<Application>) -> Result<()> {
    let p = path();
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d)?;
    }
    // Write-then-rename so a crash mid-save can't leave a truncated file.
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&apps)?)?;
    std::fs::rename(tmp, p)?;
    Ok(())
}
