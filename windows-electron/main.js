const path = require("node:path");
const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");

let mainWindow;
let outputWindow;
let selectedDisplayId = null;
let activeOutputDisplayId = null;
let displayChangeTimer = null;
let lastTeleprompterSnapshot = null;
let lastTeleprompterPlayback = null;

// 把外链交给系统浏览器打开，避免在应用内新开带渲染进程的窗口或导航走本地页面
function constrainWebNavigation(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function cacheTeleprompterState(message) {
  if (message?.kind === "snapshot") {
    lastTeleprompterSnapshot = message;
  } else if (message?.kind === "playback") {
    lastTeleprompterPlayback = message;
  } else if (message) {
    lastTeleprompterSnapshot = message;
  }
}

function sendCachedTeleprompterState(window, stateMarker = null) {
  if (!window || window.isDestroyed()) {
    return;
  }
  // 窗口加载期间主窗口可能已经推送过新状态，此时再重放缓存会打乱顺序
  if (stateMarker && stateMarker.receivedLiveState) {
    return;
  }
  if (lastTeleprompterSnapshot) {
    window.webContents.send("teleprompter-state", lastTeleprompterSnapshot);
  }
  if (lastTeleprompterPlayback) {
    window.webContents.send("teleprompter-state", lastTeleprompterPlayback);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 560,
    title: "提词器",
    backgroundColor: "#050607",
    icon: path.join(__dirname, "resources", "AppIcon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  constrainWebNavigation(mainWindow.webContents);

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
    }
    outputWindow = null;
  });
}

function getDisplayId(display) {
  return String(display.id);
}

function getOutputDisplays() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.map((display, index) => ({
    id: getDisplayId(display),
    name: display.label?.trim() || `显示器 ${index + 1}`,
    width: display.bounds.width,
    height: display.bounds.height,
    isPrimary: display.id === primary.id,
  }));
}

function getOutputDisplay(requestedDisplayId = selectedDisplayId || activeOutputDisplayId) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const requested = requestedDisplayId == null ? null : String(requestedDisplayId);
  return displays.find((display) => getDisplayId(display) === requested)
    || displays.find((display) => display.id !== primary.id)
    || primary;
}

function isOutputWindowOpen() {
  return Boolean(outputWindow && !outputWindow.isDestroyed());
}

function getOutputStatus(opened = isOutputWindowOpen(), notice = null) {
  const display = getOutputDisplay(opened ? activeOutputDisplayId : selectedDisplayId);
  return {
    opened,
    displayCount: screen.getAllDisplays().length,
    outputWidth: display.bounds.width,
    outputHeight: display.bounds.height,
    selectedDisplayId: getDisplayId(display),
    displays: getOutputDisplays(),
    notice,
  };
}

function sendOutputStatus(notice = null) {
  const status = getOutputStatus(isOutputWindowOpen(), notice);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("output-window-status", status);
  }
  return status;
}

function moveOutputWindowToDisplay(display) {
  if (!isOutputWindowOpen()) {
    return;
  }
  outputWindow.setFullScreen(false);
  outputWindow.setBounds(display.bounds, false);
  outputWindow.setFullScreen(true);
  activeOutputDisplayId = getDisplayId(display);
}

function selectOutputDisplay(displayId) {
  const requestedId = displayId == null ? "" : String(displayId);
  const display = screen.getAllDisplays().find((candidate) => getDisplayId(candidate) === requestedId);
  if (!display) {
    selectedDisplayId = null;
    return sendOutputStatus("display-unavailable");
  }

  selectedDisplayId = requestedId;
  if (isOutputWindowOpen() && activeOutputDisplayId !== requestedId) {
    moveOutputWindowToDisplay(display);
    mainWindow?.focus();
  }
  return sendOutputStatus();
}

function createOutputWindow(requestedDisplayId) {
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.focus();
    return getOutputStatus(true);
  }

  if (requestedDisplayId != null) {
    const requested = String(requestedDisplayId);
    if (screen.getAllDisplays().some((display) => getDisplayId(display) === requested)) {
      selectedDisplayId = requested;
    }
  }
  const display = getOutputDisplay();
  activeOutputDisplayId = getDisplayId(display);
  outputWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    fullscreen: true,
    frame: false,
    title: "提词器输出",
    backgroundColor: "#050607",
    icon: path.join(__dirname, "resources", "AppIcon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  outputWindow.setMenuBarVisibility(false);
  // 录课/直播时第二屏需盖在 PPT、OBS、Zoom 等窗口之上
  outputWindow.setAlwaysOnTop(true, "screen-saver");
  outputWindow.loadFile(path.join(__dirname, "index.html"), {
    query: { mode: "output" },
  });
  constrainWebNavigation(outputWindow.webContents);
  const createdOutputWindow = outputWindow;
  const stateMarker = { receivedLiveState: false };
  createdOutputWindow.stateMarker = stateMarker;

  createdOutputWindow.webContents.once("did-finish-load", () => {
    sendCachedTeleprompterState(createdOutputWindow, stateMarker);
  });

  createdOutputWindow.on("closed", () => {
    if (outputWindow !== createdOutputWindow) {
      return;
    }
    outputWindow = null;
    activeOutputDisplayId = null;
    sendOutputStatus();
    mainWindow?.focus();
  });

  return sendOutputStatus();
}

function closeOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) {
    const closingOutputWindow = outputWindow;
    outputWindow = null;
    activeOutputDisplayId = null;
    closingOutputWindow.close();
  }
  mainWindow?.focus();
  return sendOutputStatus();
}

function toggleOutputWindow(displayId) {
  if (outputWindow && !outputWindow.isDestroyed()) {
    return closeOutputWindow();
  }
  return createOutputWindow(displayId);
}

function handleDisplayConfigurationChange() {
  clearTimeout(displayChangeTimer);
  displayChangeTimer = setTimeout(() => {
    const availableIds = new Set(screen.getAllDisplays().map(getDisplayId));
    const outputDisconnected = activeOutputDisplayId && !availableIds.has(activeOutputDisplayId);
    const selectionDisconnected = selectedDisplayId && !availableIds.has(selectedDisplayId);

    if (selectionDisconnected) {
      selectedDisplayId = null;
    }
    if (outputDisconnected && isOutputWindowOpen()) {
      const disconnectedWindow = outputWindow;
      outputWindow = null;
      activeOutputDisplayId = null;
      disconnectedWindow.close();
      mainWindow?.focus();
      sendOutputStatus("display-disconnected");
      return;
    }

    if (isOutputWindowOpen()) {
      const display = getOutputDisplay(activeOutputDisplayId);
      moveOutputWindowToDisplay(display);
      mainWindow?.focus();
    }
    sendOutputStatus(selectionDisconnected ? "display-disconnected" : null);
  }, 120);
}

ipcMain.handle("toggle-fullscreen", () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.handle("toggle-output-window", (_event, displayId) => toggleOutputWindow(displayId));

ipcMain.handle("close-output-window", () => closeOutputWindow());

ipcMain.handle("get-output-status", () => getOutputStatus());

ipcMain.handle("select-output-display", (_event, displayId) => selectOutputDisplay(displayId));

ipcMain.on("teleprompter-state", (event, state) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return;
  }
  cacheTeleprompterState(state);
  if (outputWindow && !outputWindow.isDestroyed()) {
    if (outputWindow.stateMarker) {
      outputWindow.stateMarker.receivedLiveState = true;
    }
    outputWindow.webContents.send("teleprompter-state", state);
  }
});

app.whenReady().then(() => {
  createWindow();
  screen.on("display-added", handleDisplayConfigurationChange);
  screen.on("display-removed", handleDisplayConfigurationChange);
  screen.on("display-metrics-changed", handleDisplayConfigurationChange);
});

// 单实例锁：第二个实例启动时聚焦已有窗口，避免抢占第二屏输出
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
