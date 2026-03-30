use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Deserialize, Serialize)]
struct WindowBounds {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
}

fn note_window_label(note_id: &str) -> String {
  format!("note_{note_id}")
}

#[tauri::command]
fn open_or_focus_note_window(
  app: tauri::AppHandle,
  note_id: String,
  pinned_bounds: WindowBounds,
) -> Result<(), String> {
  let window_label = note_window_label(&note_id);

  if let Some(window) = app.get_webview_window(&window_label) {
    window.show().map_err(|error| error.to_string())?;
    // window.set_focus().map_err(|error| error.to_string())?;
    return Ok(());
  }

  let window = WebviewWindowBuilder::new(
    &app,
    &window_label,
    WebviewUrl::App("index.html".into())
  )
  .title("StickIt Note")
  .position(pinned_bounds.x, pinned_bounds.y)
  .inner_size(pinned_bounds.width, pinned_bounds.height)
  .resizable(true)
  .decorations(false)        // no border
  .skip_taskbar(true)        // not in taskbar
  .always_on_top(true)       // stays visible
  .transparent(true)         // needed for widget feel
  .focused(false)            // don’t steal focus
  .build()
  .map_err(|error| error.to_string())?;

  window.show().map_err(|error| error.to_string())?;
  // window.set_focus().map_err(|error| error.to_string())?;

  Ok(())
}

#[tauri::command]
fn close_note_window(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
  let window_label = note_window_label(&note_id);

  if let Some(window) = app.get_webview_window(&window_label) {
    window.close().map_err(|error| error.to_string())?;
  }

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      open_or_focus_note_window,
      close_note_window
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
