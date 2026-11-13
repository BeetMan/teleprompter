use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
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
    // 第二屏窗口实测的可用显示区域（CSS 像素），只对测量时所在的显示器有效
    output_viewport: Mutex<Option<MeasuredViewport>>,
    // 防休眠线程的开关通道，第一次用到时才启动线程
    keep_awake: OnceLock<Sender<bool>>,
}

#[derive(Clone, PartialEq)]
struct MeasuredViewport {
    display_id: String,
    width: u32,
    height: u32,
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

fn read_measured_viewport(app_state: &AppState) -> Result<Option<MeasuredViewport>, String> {
    app_state
        .output_viewport
        .lock()
        .map_err(|_| "状态锁定失败".to_string())
        .map(|value| value.clone())
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
    measured: Option<&MeasuredViewport>,
    notice: Option<String>,
) -> OutputWindowStatus {
    let target_index = resolve_monitor_index(monitors, primary_position, target_display_id);
    let target_monitor = target_index.and_then(|index| monitors.get(index));
    let target_id = target_monitor.map(monitor_id);
    // 第二屏打开且在同一显示器上实测过时，以实测尺寸为准（刘海、任务栏、全屏未铺满等情况
    // 实际可用区域会和显示器分辨率不同）；否则用显示器分辨率作为预估
    let measured = measured
        .filter(|viewport| opened && target_id.as_deref() == Some(viewport.display_id.as_str()));
    OutputWindowStatus {
        opened,
        display_count: monitors.len(),
        output_width: measured
            .map(|viewport| viewport.width)
            .or_else(|| target_monitor.map(|monitor| monitor.size().width)),
        output_height: measured
            .map(|viewport| viewport.height)
            .or_else(|| target_monitor.map(|monitor| monitor.size().height)),
        selected_display_id: target_id,
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

// macOS 原生全屏会新建独立 Space 并播放过渡动画，第二屏会被切走；
// simple fullscreen 直接铺满当前显示器，其他平台上等同 set_fullscreen。
fn set_output_fullscreen(output_window: &WebviewWindow, enable: bool) -> Result<(), String> {
    output_window
        .set_simple_fullscreen(enable)
        .map_err(|error| error.to_string())
}

// macOS 窗口坐标是逻辑坐标，混合缩放（Retina + 外接屏）时需按目标显示器自己的缩放换算；
// Windows / Linux 直接使用物理坐标。
fn monitor_geometry(monitor: &Monitor) -> (Position, Size) {
    let position = *monitor.position();
    let size = *monitor.size();
    if cfg!(target_os = "macos") {
        let scale = monitor.scale_factor();
        (
            Position::Logical(position.to_logical(scale)),
            Size::Logical(size.to_logical(scale)),
        )
    } else {
        (
            Position::Physical(PhysicalPosition::new(position.x, position.y)),
            Size::Physical(PhysicalSize::new(size.width, size.height)),
        )
    }
}

fn move_output_window_to_monitor(
    output_window: &WebviewWindow,
    monitor: &Monitor,
) -> Result<(), String> {
    let (position, size) = monitor_geometry(monitor);
    set_output_fullscreen(output_window, false)?;
    output_window
        .set_position(position)
        .map_err(|error| error.to_string())?;
    output_window
        .set_size(size)
        .map_err(|error| error.to_string())?;
    output_window.show().map_err(|error| error.to_string())?;
    set_output_fullscreen(output_window, true)?;
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
            let _ = set_output_fullscreen(window, false);
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
    let measured = read_measured_viewport(app_state)?;
    Ok(make_output_status(
        &monitors,
        primary_position,
        target_display_id,
        outcome.opened,
        measured.as_ref(),
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
        set_output_fullscreen(&output_window, false)?;
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

    let measured = read_measured_viewport(&app_state)?;
    let status = make_output_status(
        &monitors,
        primary_position,
        Some(&target_display_id),
        true,
        measured.as_ref(),
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
        set_output_fullscreen(&output_window, false)?;
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
    let measured = read_measured_viewport(&app_state)?;
    let status = make_output_status(
        &monitors,
        primary_position,
        Some(&display_id),
        opened,
        measured.as_ref(),
        None,
    );
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
fn output_viewport(
    app: AppHandle,
    window: WebviewWindow,
    width: u32,
    height: u32,
    app_state: State<AppState>,
) -> Result<(), String> {
    if window.label() != "output" {
        return Err("只有输出窗口可以上报显示区域".to_string());
    }
    // 隐藏状态下的窗口尺寸不代表第二屏，忽略
    if width == 0 || height == 0 || !window.is_visible().unwrap_or(false) {
        return Ok(());
    }
    let Some(display_id) = read_display_id(&app_state.active_output_display_id)? else {
        return Ok(());
    };
    let next = MeasuredViewport {
        display_id,
        width,
        height,
    };
    {
        let mut current = app_state
            .output_viewport
            .lock()
            .map_err(|_| "状态锁定失败".to_string())?;
        if current.as_ref() == Some(&next) {
            return Ok(());
        }
        *current = Some(next);
    }
    let main_window = main_window(&app)?;
    let status = inspect_output_status(&app, &main_window, &app_state, None)?;
    emit_output_status(&app, &status)
}

// 防休眠由一个专用线程持有，而不是放在命令里直接申请：
// - Windows 的 SetThreadExecutionState 绑定调用线程，申请和释放必须在同一线程上；
// - Linux 走 D-Bus 阻塞调用，释放失败时 keepawake 会 panic，不能让它发生在主线程上。
// 收到 true 时申请“阻止显示器熄屏”，收到 false 时释放；进程退出时系统会自动回收。
fn spawn_keep_awake_worker(app_id: String) -> Sender<bool> {
    let (sender, receiver) = mpsc::channel::<bool>();
    std::thread::spawn(move || {
        let mut guard: Option<keepawake::KeepAwake> = None;
        for active in receiver {
            if !active {
                guard = None;
            } else if guard.is_none() {
                // 申请失败（例如 Linux 桌面没有提供 org.freedesktop.ScreenSaver）不影响提词，下次开关时再试
                // reason 用 ASCII：macOS 的 `pmset -g assertions` 显示不了中文名称，排查时会看到空串
                guard = keepawake::Builder::default()
                    .display(true)
                    .reason("Teleprompter is playing or showing on the output display")
                    .app_name("Teleprompter")
                    .app_reverse_domain(app_id.clone())
                    .create()
                    .map_err(|error| eprintln!("keep awake unavailable: {error}"))
                    .ok();
            }
        }
    });
    sender
}

#[tauri::command]
fn set_keep_awake(
    app: AppHandle,
    window: WebviewWindow,
    active: bool,
    app_state: State<AppState>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("只有主窗口可以控制防休眠".to_string());
    }
    app_state
        .keep_awake
        .get_or_init(|| spawn_keep_awake_worker(app.config().identifier.clone()))
        .send(active)
        .map_err(|_| "防休眠线程不可用".to_string())
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
            output_viewport,
            teleprompter_state,
            set_keep_awake,
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
