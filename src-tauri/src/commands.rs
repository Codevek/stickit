// commands.rs — Tauri IPC command handlers

use crate::db::Db;
use crate::models::{AppSettings, CreateTodo, Todo, UpdateTodo};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

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

    // Apply auto-launch registry entry on Windows
    #[cfg(target_os = "windows")]
    apply_auto_launch_win(settings.auto_launch).map_err(|e| e.to_string())?;

    // Broadcast settings to the widget window so it applies them immediately
    if let Some(widget) = app.get_webview_window("widget") {
        let _ = widget.emit("settings-changed", &settings);
    }

    Ok(())
}


#[tauri::command]
pub fn set_setting(key: String, value: String, state: State<'_, DbState>) -> Result<(), String> {
    let db = state.0.lock().unwrap();
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

// ─── Auto-launch Commands ─────────────────────────────────────────────────────

/// Directly enable or disable Windows startup entry without a full settings save.
#[tauri::command]
pub fn set_auto_launch(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    apply_auto_launch_win(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns whether StickIt is currently registered in the Windows startup registry.
#[tauri::command]
pub fn get_auto_launch() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    return is_auto_launch_enabled_win().map_err(|e| e.to_string());
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

// ─── Windows registry helpers ─────────────────────────────────────────────────

#[cfg(target_os = "windows")]
const RUN_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(target_os = "windows")]
const APP_REG_NAME: &str = "StickIt";

/// Write or remove the HKCU Run entry so Windows launches StickIt on login.
#[cfg(target_os = "windows")]
pub fn apply_auto_launch_win(enabled: bool) -> Result<(), String> {
    use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
    use windows::Win32::System::Registry::*;
    use windows::core::PCWSTR;

    let key_wide: Vec<u16> = RUN_KEY.encode_utf16().chain(std::iter::once(0)).collect();
    let name_wide: Vec<u16> = APP_REG_NAME
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut hkey = HKEY::default();
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_wide.as_ptr()),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        )
        .ok()  // WIN32_ERROR → windows::core::Result<()>
        .map_err(|e| format!("RegOpenKeyExW: {e}"))?;

        let result = if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| format!("current_exe: {e}"))?;
            let exe_wide: Vec<u16> = exe
                .to_string_lossy()
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            RegSetValueExW(
                hkey,
                PCWSTR(name_wide.as_ptr()),
                0,
                REG_SZ,
                Some(std::slice::from_raw_parts(
                    exe_wide.as_ptr() as *const u8,
                    exe_wide.len() * 2,
                )),
            )
            .ok()
            .map_err(|e| format!("RegSetValueExW: {e}"))
        } else {
            // ERROR_FILE_NOT_FOUND (2) just means the key wasn't set — that's fine
            let del = RegDeleteValueW(hkey, PCWSTR(name_wide.as_ptr()));
            if del == ERROR_FILE_NOT_FOUND {
                Ok(())
            } else {
                del.ok().map_err(|e| format!("RegDeleteValueW: {e}"))
            }
        };

        let _ = RegCloseKey(hkey);
        result
    }
}

/// Check if the StickIt startup entry exists in the Windows registry.
#[cfg(target_os = "windows")]
pub fn is_auto_launch_enabled_win() -> Result<bool, String> {
    use windows::Win32::System::Registry::*;
    use windows::core::PCWSTR;

    let key_wide: Vec<u16> = RUN_KEY.encode_utf16().chain(std::iter::once(0)).collect();
    let name_wide: Vec<u16> = APP_REG_NAME
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut hkey = HKEY::default();
        // ok() converts WIN32_ERROR → Result; if it fails, startup entry can't exist
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_wide.as_ptr()),
            0,
            KEY_QUERY_VALUE,
            &mut hkey,
        )
        .ok()
        .is_err()
        {
            return Ok(false);
        }

        let mut data_len: u32 = 0;
        let found = RegQueryValueExW(
            hkey,
            PCWSTR(name_wide.as_ptr()),
            None,
            None,
            None,
            Some(&mut data_len),
        )
        .ok()
        .is_ok();
        let _ = RegCloseKey(hkey);
        Ok(found)
    }
}

// ─── Window Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        if win.is_visible().map_err(|e| e.to_string())? {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_widget_focus_mode(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    if let Some(widget) = app.get_webview_window("widget") {
        if let Ok(hwnd) = widget.hwnd() {
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
                };
                let hw: windows::Win32::Foundation::HWND = std::mem::transmute_copy(&hwnd);
                let mut style = GetWindowLongPtrW(hw, GWL_EXSTYLE);
                style &= !(WS_EX_NOACTIVATE.0 as isize);
                SetWindowLongPtrW(hw, GWL_EXSTYLE, style);
            }
        }
        let _ = widget.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn set_widget_blur_mode(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    if let Some(widget) = app.get_webview_window("widget") {
        if let Ok(hwnd) = widget.hwnd() {
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
                };
                let hw: windows::Win32::Foundation::HWND = std::mem::transmute_copy(&hwnd);
                let mut style = GetWindowLongPtrW(hw, GWL_EXSTYLE);
                style |= WS_EX_NOACTIVATE.0 as isize;
                SetWindowLongPtrW(hw, GWL_EXSTYLE, style);
            }
        }
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
