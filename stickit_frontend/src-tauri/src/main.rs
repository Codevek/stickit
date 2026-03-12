// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};

#[tauri::command]
fn pin_note(app: tauri::AppHandle, note: serde_json::Value) {

    let id = note["id"].as_str().unwrap();

    WebviewWindowBuilder::new(
        &app,
        format!("note_{}", id),
        WebviewUrl::App("index.html".into())
    )
    .title("StickIt Note")
    .inner_size(300.0, 200.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .shadow(true)
    .build()
    .unwrap();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pin_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}