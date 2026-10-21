mod agents;
mod api;
mod approvals;
mod career;
mod code;
mod config;
mod defaults;
mod dirs;
mod error;
mod identities;
mod inbox;
mod n8n;
mod launch;
mod projects;
mod research;
mod revenue;
mod school;
mod secrets;
mod sentry;
mod system;
mod tasks;

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Summon hotkey: bring Atlas forward, or tuck it away if it's already in front.
fn toggle(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let front = w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false);
    if front {
        let _ = w.hide();
    } else {
        show(app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .manage(agents::Inflight::default())
        .manage(system::Sys::default())
        .manage(research::Running::default())
        .manage(inbox::Scanning::default())
        .setup(|app| {
            // Local API for n8n: 127.0.0.1 only, Keychain token required.
            api::start(app.handle().clone());
            let hotkey = config::load().map(|c| c.summon_hotkey).unwrap_or_default();
            if !hotkey.is_empty() {
                // A bad or already-taken shortcut shouldn't stop the app from opening.
                if let Err(e) = app.global_shortcut().register(hotkey.as_str()) {
                    eprintln!("atlas: could not register summon hotkey '{hotkey}': {e}");
                }
            }
            Ok(())
        })
        // Closing the window hides it: a command center should be one hotkey away,
        // not a cold start. ⌘Q still quits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            config::config_get,
            config::config_set,
            projects::projects_status,
            projects::roadmap_create,
            sentry::sentry_overview,
            revenue::revenue_overview,
            revenue::health_checks,
            agents::agent_chat,
            agents::agent_cancel,
            agents::ollama_models,
            secrets::secret_status,
            secrets::secret_set,
            secrets::secret_clear,
            launch::launch,
            launch::launcher_icon,
            school::schedule,
            school::open_course_folder,
            system::system_stats,
            career::applications_get,
            career::applications_set,
            research::missions_list,
            research::mission_get,
            research::mission_create,
            research::mission_run,
            research::mission_cancel,
            research::mission_delete,
            inbox::inbox_scan,
            inbox::opportunities_get,
            inbox::opportunity_set_status,
            dirs::dir_scan,
            dirs::dir_agent_chat,
            dirs::orchestrator_profile,
            tasks::tasks_list,
            tasks::task_create,
            tasks::task_draft_update,
            tasks::task_delete,
            tasks::copy_text,
            tasks::resume_info,
            approvals::approvals_list,
            approvals::approval_decide,
            n8n::n8n_status,
            n8n::n8n_set_active,
            n8n::n8n_install_templates,
            n8n::n8n_run,
            n8n::notes_list,
            identities::identities_get,
            code::code_overview,
            code::code_patterns,
            code::code_toolkit,
            code::code_open,
            code::code_save_draft,
            code::code_run,
            code::code_hint,
            code::code_reveal,
            code::code_followups,
            code::code_drills,
            code::code_drill_answer,
            code::code_interviewer,
            code::code_mock_finish,
            identities::identities_save,
            identities::account_connect_n8n,
            identities::post_via_account,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        // Clicking the Dock icon after the window was hidden.
        if let RunEvent::Reopen { .. } = event {
            show(app);
        }
    });
}

/// Dumps real command output to a JSON fixture for the mock UI build:
///   ATLAS_FIXTURE=/path/fixture.json cargo test dump_fixture -- --ignored
#[cfg(test)]
mod fixture {
    #[tokio::test]
    #[ignore]
    async fn dump_fixture() {
        let path = std::env::var("ATLAS_FIXTURE").expect("set ATLAS_FIXTURE");
        let cfg = crate::config::config_get().unwrap();
        let launchers = crate::config::load().unwrap().launchers;
        let mut icons = serde_json::Map::new();
        let mut found = 0;
        for l in &launchers {
            let icon = crate::launch::launcher_icon(l.id.clone()).await.unwrap_or(None);
            if icon.is_some() {
                found += 1;
            }
            icons.insert(l.id.clone(), serde_json::json!(icon));
        }
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        let out = serde_json::json!({
            "config_get": cfg,
            "projects_status": crate::projects::projects_status().await.unwrap(),
            "schedule": crate::school::schedule().unwrap(),
            "health_checks": crate::revenue::health_checks().await.unwrap(),
            "sentry_overview": crate::sentry::sentry_overview().await.unwrap(),
            "revenue_overview": crate::revenue::revenue_overview().await.unwrap(),
            "ollama_models": crate::agents::ollama_models().await.unwrap_or_default(),
            "system_stats": { "memUsed": sys.used_memory(), "memTotal": sys.total_memory(), "cpu": 12.0, "uptimeSecs": 0 },
            "applications_get": crate::career::applications_get().unwrap(),
            "opportunities_get": crate::inbox::opportunities_get().unwrap(),
            "orchestrator_profile": crate::dirs::orchestrator_profile().unwrap(),
            "tasks_list": crate::tasks::tasks_list().unwrap(),
            "resume_info": crate::tasks::resume_info().unwrap(),
            "n8n_status": crate::n8n::n8n_status().await.unwrap(),
            "approvals_list": crate::approvals::approvals_list().unwrap(),
            "notes_list": crate::n8n::notes_list().unwrap(),
            "identities_get": crate::identities::identities_get().unwrap(),
            "code_overview": crate::code::overview_now(),
            "code_patterns": crate::code::code_patterns(),
            "code_toolkit": crate::code::code_toolkit(),
            "code_drills": crate::code::code_drills(),
            "code_open": crate::code::code_open("two-sum".into()).unwrap(),
            "code_run": crate::code::fixture_run().await,
            "dir_scan": crate::config::load().unwrap().projects.iter().find(|p| p.id == "visbets")
                .and_then(|p| crate::dirs::scan_blocking(&format!("{}/backend", p.path)).ok()),
            "secret_status": crate::secrets::secret_status().unwrap(),
            "missions_list": crate::research::list(&crate::research::Running::default()).unwrap(),
            "mission_get": crate::research::list(&crate::research::Running::default()).unwrap().first()
                .and_then(|m| serde_json::to_value(m).ok())
                .and_then(|m| m["mission"]["id"].as_str().map(String::from))
                .and_then(|id| crate::research::get(&crate::research::Running::default(), &id).ok()),
            "icons": icons,
        });
        std::fs::write(&path, serde_json::to_string(&out).unwrap()).unwrap();
        println!("fixture: {} launchers, {} icons resolved", launchers.len(), found);
    }
}
