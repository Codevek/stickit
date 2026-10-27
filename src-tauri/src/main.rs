// main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn ensure_single_instance() -> bool {
    use windows::core::w;
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
    };

    unsafe {
        let _ = CreateMutexW(None, true, w!("Global\\StickItAppSingleInstanceMutex"));
        if GetLastError() == ERROR_ALREADY_EXISTS {
            if let Ok(hwnd) = FindWindowW(None, w!("StickIt")) {
                if !hwnd.0.is_null() {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = ShowWindow(hwnd, SW_SHOW);
                    let _ = SetForegroundWindow(hwnd);
                }
            }
            return false;
        }
    }
    true
}

fn main() {
    #[cfg(target_os = "windows")]
    if !ensure_single_instance() {
        return;
    }

    stickit_lib::run();
}
