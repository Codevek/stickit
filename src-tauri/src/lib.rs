// lib.rs — Tauri app setup, system tray, plugin registration

mod commands;
mod db;
mod models;

use commands::DbState;
use db::Db;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // ── Init DB ──────────────────────────────────────────────────
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");

            let db = Db::new(app_data_dir);
            db.init().expect("failed to init DB");

            // Restore last widget position/size from settings
            if let Ok(settings) = db.get_settings() {
                if let Some(widget) = app.get_webview_window("widget") {
                    let _ = widget.set_position(tauri::PhysicalPosition::new(
                        settings.widget_x,
                        settings.widget_y,
                    ));
                    let _ = widget.set_size(tauri::PhysicalSize::new(
                        settings.widget_w,
                        settings.widget_h,
                    ));
                    
                    #[cfg(target_os = "windows")]
                    if let Ok(hwnd) = widget.hwnd() {
                        unsafe {
                            use windows::Win32::UI::WindowsAndMessaging::{
                                GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
                            };
                            let hw: windows::Win32::Foundation::HWND = std::mem::transmute_copy(&hwnd);
                            let style = GetWindowLongPtrW(hw, GWL_EXSTYLE);
                            SetWindowLongPtrW(hw, GWL_EXSTYLE, style | (WS_EX_NOACTIVATE.0 as isize));
                        }
                    }
                }
            }

            app.manage(DbState(Mutex::new(db)));

            // ── System Tray ──────────────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show_widget", "Show Widget").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings…").build(app)?;
            let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit StickIt").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&settings_item)
                .item(&sep)
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("StickIt")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show_widget" => {
                        if let Some(win) = app.get_webview_window("widget") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "settings" => {
                        let _ = commands::open_settings(app.clone());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("widget") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_todos,
            commands::create_todo,
            commands::update_todo,
            commands::delete_todo,
            commands::clear_completed,
            commands::get_settings,
            commands::save_settings,
            commands::set_setting,
            commands::open_settings,
            commands::toggle_settings,
            commands::set_widget_focus_mode,
            commands::set_widget_blur_mode,
            commands::save_widget_bounds,
            commands::toggle_always_on_top,

        ])
        .on_window_event(|window, event| {
            // Hide to tray instead of quitting when main widget is "closed"
            if window.label() == "widget" || window.label() == "settings" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
