use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Size, State,
    WebviewWindow,
};

#[derive(Default)]
struct AppState {
    last_snapshot: Mutex<Option<Value>>,
    last_playback: Mutex<Option<Value>>,
    selected_display_id: Mutex<Option<String>>,
    active_output_display_id: Mutex<Option<String>>,
    // 打开第二屏后是否已向 webview 推送过实时状态；推过就不能再重放缓存，否则会打乱顺序
    output_received_live_state: Mutex<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputDisplay {
    id: String,
    name: String,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputWindowStatus {
    opened: bool,
    display_count: usize,
    output_width: Option<u32>,
    output_height: Option<u32>,
    selected_display_id: Option<String>,
    displays: Vec<OutputDisplay>,
    notice: Option<String>,
}

fn monitor_id(monitor: &Monitor) -> String {
    format!("display:{}:{}", monitor.position().x, monitor.position().y)
}

fn monitor_context(window: &WebviewWindow) -> Result<(Vec<Monitor>, Option<(i32, i32)>), String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary_position = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .map(|monitor| (monitor.position().x, monitor.position().y));
    Ok((monitors, primary_position))
}

fn resolve_monitor_index(
    monitors: &[Monitor],
    primary_position: Option<(i32, i32)>,
    display_id: Option<&str>,
) -> Option<usize> {
    display_id
        .and_then(|id| {
            monitors
                .iter()
                .position(|monitor| monitor_id(monitor) == id)
        })
        .or_else(|| {
            monitors.iter().position(|monitor| {
                Some((monitor.position().x, monitor.position().y)) != primary_position
            })
        })
        .or_else(|| (!monitors.is_empty()).then_some(0))
}

fn display_list(monitors: &[Monitor], primary_position: Option<(i32, i32)>) -> Vec<OutputDisplay> {
    monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| OutputDisplay {
            id: monitor_id(monitor),
            name: monitor
                .name()
                .filter(|name| !name.trim().is_empty())
                .cloned()
                .unwrap_or_else(|| format!("显示器 {}", index + 1)),
            width: monitor.size().width,
            height: monitor.size().height,
            is_primary: Some((monitor.position().x, monitor.position().y)) == primary_position,
        })
        .collect()
}

fn read_display_id(value: &Mutex<Option<String>>) -> Result<Option<String>, String> {
    value
        .lock()
        .map_err(|_| "显示器状态锁定失败".to_string())
        .map(|value| value.clone())
}

fn write_display_id(
    value: &Mutex<Option<String>>,
    display_id: Option<String>,
) -> Result<(), String> {
    *value.lock().map_err(|_| "显示器状态锁定失败".to_string())? = display_id;
    Ok(())
}

fn make_output_status(
    monitors: &[Monitor],
    primary_position: Option<(i32, i32)>,
    target_display_id: Option<&str>,
    opened: bool,
    notice: Option<String>,
) -> OutputWindowStatus {
    let target_index = resolve_monitor_index(monitors, primary_position, target_display_id);
    let target_monitor = target_index.and_then(|index| monitors.get(index));
    OutputWindowStatus {
        opened,
        display_count: monitors.len(),
        output_width: target_monitor.map(|monitor| monitor.size().width),
        output_height: target_monitor.map(|monitor| monitor.size().height),
        selected_display_id: target_monitor.map(monitor_id),
        displays: display_list(monitors, primary_position),
        notice,
    }
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

// 显示器配置指纹：id + 位置 + 尺寸。任一变化（增减、拔插、改分辨率）都会改变签名。
fn monitor_signature(monitors: &[Monitor]) -> String {
    monitors
        .iter()
        .map(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            format!(
                "{}|{}|{}|{}|{}",
                monitor_id(monitor),
                position.x,
                position.y,
                size.width,
                size.height
            )
        })
        .collect::<Vec<_>>()
        .join(";")
}

// Tauri 2 没有原生显示器变更事件，用轻量轮询对齐 Electron 的 display-added/removed/metrics-changed。
// 签名变化时重新 reconcile（断开的输出屏会被收起）并主动推送状态给主窗口，不依赖前端 2 秒轮询。
fn spawn_display_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_signature: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_millis(1500));
            let main_window = match app.get_webview_window("main") {
                Some(window) => window,
                None => continue,
            };
            let app_state = app.state::<AppState>();
            let (monitors, _primary_position) = match monitor_context(&main_window) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let signature = monitor_signature(&monitors);
            if last_signature.is_none() {
                // 首拍只采样基线，避免启动时重复推送
                last_signature = Some(signature);
                continue;
            }
            if last_signature.as_deref() == Some(signature.as_str()) {
                continue;
            }
            last_signature = Some(signature);
            if let Ok(status) = inspect_output_status(&app, &main_window, app_state.inner(), None) {
                let _ = emit_output_status(&app, &status);
            }
        }
    });
}

fn output_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("output")
        .ok_or_else(|| "输出窗口不可用".to_string())
}

fn move_output_window_to_monitor(
    output_window: &WebviewWindow,
    monitor: &Monitor,
) -> Result<(), String> {
    let position = monitor.position();
    let size = monitor.size();
    output_window
        .set_fullscreen(false)
        .map_err(|error| error.to_string())?;
    output_window
        .set_position(Position::Physical(PhysicalPosition::new(
            position.x, position.y,
        )))
        .map_err(|error| error.to_string())?;
    output_window
        .set_size(Size::Physical(PhysicalSize::new(size.width, size.height)))
        .map_err(|error| error.to_string())?;
    output_window.show().map_err(|error| error.to_string())?;
    output_window
        .set_fullscreen(true)
        .map_err(|error| error.to_string())?;
    // 录课/直播时第二屏需盖在 PPT、OBS、Zoom 等窗口之上
    output_window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(Default)]
struct ReconcileOutcome {
    opened: bool,
    disconnected: bool,
}

fn reconcile_output_display(
    app: &AppHandle,
    main_window: &WebviewWindow,
    app_state: &AppState,
    monitors: &[Monitor],
) -> Result<ReconcileOutcome, String> {
    let available_ids: Vec<String> = monitors.iter().map(monitor_id).collect();
    let selected_display_id = read_display_id(&app_state.selected_display_id)?;
    let active_display_id = read_display_id(&app_state.active_output_display_id)?;
    let output_window = output_window(app).ok();
    let mut opened = output_window
        .as_ref()
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    let selection_disconnected = selected_display_id
        .as_ref()
        .is_some_and(|id| !available_ids.contains(id));
    let output_disconnected = opened
        && active_display_id
            .as_ref()
            .is_some_and(|id| !available_ids.contains(id));

    if selection_disconnected {
        write_display_id(&app_state.selected_display_id, None)?;
    }
    if output_disconnected {
        if let Some(window) = output_window.as_ref() {
            let _ = window.set_fullscreen(false);
            let _ = window.hide();
        }
        write_display_id(&app_state.active_output_display_id, None)?;
        let _ = main_window.set_focus();
        opened = false;
    }

    Ok(ReconcileOutcome {
        opened,
        disconnected: selection_disconnected || output_disconnected,
    })
}

fn inspect_output_status(
    app: &AppHandle,
    main_window: &WebviewWindow,
    app_state: &AppState,
    requested_notice: Option<String>,
) -> Result<OutputWindowStatus, String> {
    let (monitors, primary_position) = monitor_context(main_window)?;
    let outcome = reconcile_output_display(app, main_window, app_state, &monitors)?;
    let active_display_id = read_display_id(&app_state.active_output_display_id)?;
    let selected_display_id = read_display_id(&app_state.selected_display_id)?;
    let target_display_id = if outcome.opened {
        active_display_id.as_deref()
    } else {
        selected_display_id.as_deref()
    };
    Ok(make_output_status(
        &monitors,
        primary_position,
        target_display_id,
        outcome.opened,
        requested_notice.or_else(|| {
            outcome
                .disconnected
                .then(|| "display-disconnected".to_string())
        }),
    ))
}

fn cache_teleprompter_state(app_state: &AppState, state: &Value) -> Result<(), String> {
    let kind = state.get("kind").and_then(Value::as_str);
    let target = if kind == Some("playback") {
        &app_state.last_playback
    } else {
        &app_state.last_snapshot
    };
    *target.lock().map_err(|_| "状态锁定失败".to_string())? = Some(state.clone());
    Ok(())
}

fn set_output_received_live_state(app_state: &AppState, value: bool) -> Result<(), String> {
    *app_state
        .output_received_live_state
        .lock()
        .map_err(|_| "状态锁定失败".to_string())? = value;
    Ok(())
}

fn emit_cached_teleprompter_state(
    output_window: &WebviewWindow,
    app_state: &AppState,
) -> Result<(), String> {
    let received_live = *app_state
        .output_received_live_state
        .lock()
        .map_err(|_| "状态锁定失败".to_string())?;
    if received_live {
        // webview 已经收到过更新的实时状态，重放旧缓存会打乱顺序
        return Ok(());
    }
    let snapshot = app_state
        .last_snapshot
        .lock()
        .map_err(|_| "状态锁定失败".to_string())?
        .clone();
    let playback = app_state
        .last_playback
        .lock()
        .map_err(|_| "状态锁定失败".to_string())?
        .clone();

    for state in [snapshot, playback].into_iter().flatten() {
        output_window
            .emit("teleprompter-state", state)
            .map_err(|error| error.to_string())?;
    }
    set_output_received_live_state(app_state, true)?;
    Ok(())
}

#[tauri::command]
fn toggle_output_window(
    app: AppHandle,
    main_window: WebviewWindow,
    display_id: Option<String>,
    app_state: State<AppState>,
) -> Result<OutputWindowStatus, String> {
    let output_window = output_window(&app)?;

    if output_window.is_visible().unwrap_or(false) {
        output_window
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
        output_window.hide().map_err(|error| error.to_string())?;
        write_display_id(&app_state.active_output_display_id, None)?;
        set_output_received_live_state(&app_state, false)?;
        main_window.set_focus().map_err(|error| error.to_string())?;
        let status = inspect_output_status(&app, &main_window, &app_state, None)?;
        emit_output_status(&app, &status)?;
        return Ok(status);
    }

    let (monitors, primary_position) = monitor_context(&main_window)?;
    let requested_display_id = display_id.filter(|id| {
        monitors
            .iter()
            .any(|monitor| monitor_id(monitor).as_str() == id.as_str())
    });
    if let Some(id) = requested_display_id.as_ref() {
        write_display_id(&app_state.selected_display_id, Some(id.clone()))?;
    }
    let selected_display_id =
        requested_display_id.or(read_display_id(&app_state.selected_display_id)?);
    let target_index =
        resolve_monitor_index(&monitors, primary_position, selected_display_id.as_deref())
            .ok_or_else(|| "没有检测到可用显示器".to_string())?;
    let target_monitor = &monitors[target_index];
    let target_display_id = monitor_id(target_monitor);
    move_output_window_to_monitor(&output_window, target_monitor)?;
    write_display_id(
        &app_state.active_output_display_id,
        Some(target_display_id.clone()),
    )?;
    set_output_received_live_state(&app_state, false)?;
    output_window
        .set_focus()
        .map_err(|error| error.to_string())?;
    main_window.set_focus().map_err(|error| error.to_string())?;

    emit_cached_teleprompter_state(&output_window, &app_state)?;

    let status = make_output_status(
        &monitors,
        primary_position,
        Some(&target_display_id),
        true,
        None,
    );
    emit_output_status(&app, &status)?;
    Ok(status)
}

#[tauri::command]
fn close_output_window(
    app: AppHandle,
    app_state: State<AppState>,
) -> Result<OutputWindowStatus, String> {
    if let Ok(output_window) = output_window(&app) {
        output_window
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
        output_window.hide().map_err(|error| error.to_string())?;
    }
    write_display_id(&app_state.active_output_display_id, None)?;
    set_output_received_live_state(&app_state, false)?;

    let main_window = main_window(&app)?;
    main_window.set_focus().map_err(|error| error.to_string())?;
    let status = inspect_output_status(&app, &main_window, &app_state, None)?;
    emit_output_status(&app, &status)?;
    Ok(status)
}

#[tauri::command]
fn get_output_status(
    app: AppHandle,
    main_window: WebviewWindow,
    app_state: State<AppState>,
) -> Result<OutputWindowStatus, String> {
    inspect_output_status(&app, &main_window, &app_state, None)
}

#[tauri::command]
fn select_output_display(
    app: AppHandle,
    main_window: WebviewWindow,
    display_id: String,
    app_state: State<AppState>,
) -> Result<OutputWindowStatus, String> {
    let (monitors, primary_position) = monitor_context(&main_window)?;
    let target_index = monitors
        .iter()
        .position(|monitor| monitor_id(monitor) == display_id);
    let Some(target_index) = target_index else {
        write_display_id(&app_state.selected_display_id, None)?;
        return inspect_output_status(
            &app,
            &main_window,
            &app_state,
            Some("display-unavailable".to_string()),
        );
    };

    let target_monitor = &monitors[target_index];
    write_display_id(&app_state.selected_display_id, Some(display_id.clone()))?;
    let mut opened = false;
    if let Ok(window) = output_window(&app) {
        opened = window.is_visible().unwrap_or(false);
        if opened {
            move_output_window_to_monitor(&window, target_monitor)?;
            write_display_id(
                &app_state.active_output_display_id,
                Some(display_id.clone()),
            )?;
            main_window.set_focus().map_err(|error| error.to_string())?;
        }
    }
    let status = make_output_status(&monitors, primary_position, Some(&display_id), opened, None);
    emit_output_status(&app, &status)?;
    Ok(status)
}

#[tauri::command]
fn output_window_ready(app: AppHandle, app_state: State<AppState>) -> Result<(), String> {
    if let Ok(output_window) = output_window(&app) {
        emit_cached_teleprompter_state(&output_window, &app_state)?;
        let main_window = main_window(&app)?;
        let status = inspect_output_status(&app, &main_window, &app_state, None)?;
        emit_output_status(&app, &status)?;
    }

    Ok(())
}

#[tauri::command]
fn toggle_fullscreen(main_window: WebviewWindow) -> Result<bool, String> {
    let next = !main_window.is_fullscreen().unwrap_or(false);
    main_window
        .set_fullscreen(next)
        .map_err(|error| error.to_string())?;
    Ok(next)
}

#[tauri::command]
fn teleprompter_state(
    app: AppHandle,
    window: WebviewWindow,
    state: Value,
    app_state: State<AppState>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("只有主窗口可以更新提词器状态".to_string());
    }

    cache_teleprompter_state(&app_state, &state)?;

    if let Ok(output_window) = output_window(&app) {
        if output_window.is_visible().unwrap_or(false) {
            output_window
                .emit("teleprompter-state", state)
                .map_err(|error| error.to_string())?;
            set_output_received_live_state(&app_state, true)?;
        }
    }

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 第二个实例启动时，聚焦已有主窗口
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.unminimize();
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }
        }))
        .manage(AppState::default())
        .setup(|app| {
            spawn_display_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_output_window,
            close_output_window,
            get_output_status,
            select_output_display,
            output_window_ready,
            teleprompter_state,
            toggle_fullscreen
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
