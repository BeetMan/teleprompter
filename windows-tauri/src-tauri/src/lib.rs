use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, State,
    WebviewWindow,
};

#[derive(Default)]
struct AppState {
    last_state: Mutex<Option<Value>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputWindowStatus {
    opened: bool,
    display_count: usize,
    output_width: Option<u32>,
    output_height: Option<u32>,
}

fn display_count(window: &WebviewWindow) -> usize {
    window.available_monitors().map(|monitors| monitors.len()).unwrap_or(1)
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "主窗口不可用".to_string())
}

fn emit_output_status(app: &AppHandle, status: &OutputWindowStatus) -> Result<(), String> {
    main_window(app)?
        .emit("output-window-status", status)
        .map_err(|error| error.to_string())
}

fn current_monitor_size(window: &WebviewWindow) -> (Option<u32>, Option<u32>) {
    window
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| (Some(monitor.size().width), Some(monitor.size().height)))
        .unwrap_or((None, None))
}

fn output_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("output")
        .ok_or_else(|| "输出窗口不可用".to_string())
}

#[tauri::command]
fn toggle_output_window(
    app: AppHandle,
    main_window: WebviewWindow,
    app_state: State<AppState>,
) -> Result<OutputWindowStatus, String> {
    let output_window = output_window(&app)?;

    if output_window.is_visible().unwrap_or(false) {
        let (output_width, output_height) = current_monitor_size(&output_window);
        output_window
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
        output_window.hide().map_err(|error| error.to_string())?;
        let status = OutputWindowStatus {
            opened: false,
            display_count: display_count(&main_window),
            output_width,
            output_height,
        };
        emit_output_status(&app, &status)?;
        return Ok(status);
    }

    let monitors = main_window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary_position = main_window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .map(|monitor| (monitor.position().x, monitor.position().y));
    let target_monitor = monitors
        .iter()
        .find(|monitor| Some((monitor.position().x, monitor.position().y)) != primary_position)
        .or_else(|| monitors.first())
        .ok_or_else(|| "没有检测到可用显示器".to_string())?;
    let position = target_monitor.position();
    let size = target_monitor.size();

    output_window
        .set_fullscreen(false)
        .map_err(|error| error.to_string())?;
    output_window
        .set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)))
        .map_err(|error| error.to_string())?;
    output_window
        .set_size(Size::Physical(PhysicalSize::new(size.width, size.height)))
        .map_err(|error| error.to_string())?;
    output_window
        .show()
        .map_err(|error| error.to_string())?;
    output_window
        .set_focus()
        .map_err(|error| error.to_string())?;
    output_window
        .set_fullscreen(true)
        .map_err(|error| error.to_string())?;

    if let Some(last_state) = app_state
        .last_state
        .lock()
        .map_err(|_| "状态锁定失败".to_string())?
        .clone()
    {
        let _ = output_window.emit("teleprompter-state", last_state);
    }

    let status = OutputWindowStatus {
        opened: true,
        display_count: monitors.len(),
        output_width: Some(size.width),
        output_height: Some(size.height),
    };
    emit_output_status(&app, &status)?;
    Ok(status)
}

#[tauri::command]
fn close_output_window(app: AppHandle) -> Result<OutputWindowStatus, String> {
    let display_count = main_window(&app).map(|window| display_count(&window)).unwrap_or(1);
    let mut output_width = None;
    let mut output_height = None;

    if let Ok(output_window) = output_window(&app) {
        (output_width, output_height) = current_monitor_size(&output_window);
        output_window
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
        output_window.hide().map_err(|error| error.to_string())?;
    }

    let status = OutputWindowStatus {
        opened: false,
        display_count,
        output_width,
        output_height,
    };
    emit_output_status(&app, &status)?;
    Ok(status)
}

#[tauri::command]
fn output_window_ready(app: AppHandle, app_state: State<AppState>) -> Result<(), String> {
    if let Ok(output_window) = output_window(&app) {
        if let Some(last_state) = app_state
            .last_state
            .lock()
            .map_err(|_| "状态锁定失败".to_string())?
            .clone()
        {
            output_window
                .emit("teleprompter-state", last_state)
                .map_err(|error| error.to_string())?;
        }
        let visible = output_window.is_visible().unwrap_or(false);
        let count = display_count(&output_window);
        let (output_width, output_height) = current_monitor_size(&output_window);
        let status = OutputWindowStatus {
            opened: visible,
            display_count: count,
            output_width,
            output_height,
        };
        emit_output_status(&app, &status)?;
    }

    Ok(())
}

#[tauri::command]
fn teleprompter_state(
    app: AppHandle,
    state: Value,
    app_state: State<AppState>,
) -> Result<(), String> {
    *app_state
        .last_state
        .lock()
        .map_err(|_| "状态锁定失败".to_string())? = Some(state.clone());

    if let Ok(output_window) = output_window(&app) {
        output_window
            .emit("teleprompter-state", state)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            toggle_output_window,
            close_output_window,
            output_window_ready,
            teleprompter_state
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running teleprompter tauri app");
}
