const path = require("node:path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");

let mainWindow;
let outputWindow;
let lastTeleprompterState = null;

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
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
    }
  });
}

function getOutputDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.find((display) => display.id !== primary.id) || primary;
}

function createOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.focus();
    return { opened: true, displayCount: screen.getAllDisplays().length };
  }

  const display = getOutputDisplay();
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
      sandbox: false,
    },
  });

  outputWindow.setMenuBarVisibility(false);
  outputWindow.loadFile(path.join(__dirname, "index.html"), {
    query: { mode: "output" },
  });

  outputWindow.webContents.once("did-finish-load", () => {
    if (lastTeleprompterState) {
      outputWindow.webContents.send("teleprompter-state", lastTeleprompterState);
    }
  });

  outputWindow.on("closed", () => {
    outputWindow = null;
    mainWindow?.webContents.send("output-window-status", { opened: false });
  });

  mainWindow?.webContents.send("output-window-status", { opened: true });
  return { opened: true, displayCount: screen.getAllDisplays().length };
}

function closeOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.close();
  }
  outputWindow = null;
  mainWindow?.webContents.send("output-window-status", { opened: false });
  return { opened: false, displayCount: screen.getAllDisplays().length };
}

function toggleOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) {
    return closeOutputWindow();
  }
  return createOutputWindow();
}

ipcMain.handle("toggle-fullscreen", () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.handle("toggle-output-window", () => toggleOutputWindow());

ipcMain.handle("close-output-window", () => closeOutputWindow());

ipcMain.on("teleprompter-state", (_event, state) => {
  lastTeleprompterState = state;
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.webContents.send("teleprompter-state", state);
  }
});

app.whenReady().then(createWindow);

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
