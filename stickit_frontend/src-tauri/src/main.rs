// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};

// #[tauri::command]
#[tauri::command]
fn pin_note(app: tauri::AppHandle, note: serde_json::Value) {

    let id = note["id"].as_str().unwrap();
    let window_label = format!("note_{}", id);

    // prevent duplicate window
    if app.get_webview_window(&window_label).is_some() {
        return;
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        window_label,
        tauri::WebviewUrl::App("index.html".into())
    )
    .title("StickIt Note")
    .inner_size(300.0, 200.0)
    .resizable(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
    .unwrap();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pin_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}