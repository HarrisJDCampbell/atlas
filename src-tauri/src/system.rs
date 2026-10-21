//! Live machine stats for the status bar: memory is the number that decides
//! whether a 14B model and forty Chrome tabs can coexist.

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;
use tauri::State;

pub struct Sys(pub Mutex<System>);

impl Default for Sys {
    fn default() -> Self {
        Sys(Mutex::new(System::new()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    mem_used: u64,
    mem_total: u64,
    /// Percent across all cores; needs two samples, so the first call reads ~0.
    cpu: f32,
    uptime_secs: u64,
}

#[tauri::command]
pub fn system_stats(sys: State<'_, Sys>) -> Stats {
    let mut s = sys.0.lock().unwrap();
    s.refresh_memory();
    s.refresh_cpu_usage();
    Stats {
        mem_used: s.used_memory(),
        mem_total: s.total_memory(),
        cpu: s.global_cpu_usage(),
        uptime_secs: System::uptime(),
    }
}
