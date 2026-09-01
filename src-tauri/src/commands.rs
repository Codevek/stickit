// commands.rs — Tauri IPC command handlers

use crate::db::Db;
use crate::models::{AppSettings, CreateTodo, Todo, UpdateTodo};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub struct DbState(pub Mutex<Db>);

// ─── Todo Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_todos(state: State<'_, DbState>) -> Result<Vec<Todo>, String> {
    let db = state.0.lock().unwrap();
    let settings = db.get_settings().map_err(|e| e.to_string())?;
    db.get_todos(settings.show_completed)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_todo(input: CreateTodo, state: State<'_, DbState>) -> Result<Todo, String> {
    let db = state.0.lock().unwrap();
    db.create_todo(input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_todo(input: UpdateTodo, state: State<'_, DbState>) -> Result<Todo, String> {
    let db = state.0.lock().unwrap();
    db.update_todo(input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_todo(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let db = state.0.lock().unwrap();
    db.delete_todo(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_completed(state: State<'_, DbState>) -> Result<usize, String> {
    let db = state.0.lock().unwrap();
    db.clear_completed().map_err(|e| e.to_string())
}

// ─── Settings Commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_settings(state: State<'_, DbState>) -> Result<AppSettings, String> {
    let db = state.0.lock().unwrap();
    db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    state: State<'_, DbState>,
    app: AppHandle,
) -> Result<(), String> {
    let db = state.0.lock().unwrap();
    db.save_settings(&settings).map_err(|e| e.to_string())?;

    // Apply opacity to widget window immediately
    if let Some(widget) = app.get_webview_window("widget") {
        let _ = widget.set_ignore_cursor_events(false);
    }

    Ok(())
}

#[tauri::command]
pub fn set_setting(key: String, value: String, state: State<'_, DbState>) -> Result<(), String> {
    let db = state.0.lock().unwrap();
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

// ─── Window Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
            .title("StickIt — Settings")
            .inner_size(500.0, 620.0)
            .resizable(false)
            .always_on_top(false)
            .decorations(true)
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_widget_bounds(
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let db = state.0.lock().unwrap();
    db.set_setting("widget_x", &x.to_string())
        .map_err(|e| e.to_string())?;
    db.set_setting("widget_y", &y.to_string())
        .map_err(|e| e.to_string())?;
    db.set_setting("widget_w", &w.to_string())
        .map_err(|e| e.to_string())?;
    db.set_setting("widget_h", &h.to_string())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_always_on_top(app: AppHandle) -> Result<bool, String> {
    if let Some(win) = app.get_webview_window("widget") {
        let current = win.is_always_on_top().map_err(|e| e.to_string())?;
        win.set_always_on_top(!current)
            .map_err(|e| e.to_string())?;
        return Ok(!current);
    }
    Ok(true)
}
