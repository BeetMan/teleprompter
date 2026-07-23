const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("webkit", {
  messageHandlers: {
    nativeFullscreen: {
      postMessage: () => ipcRenderer.invoke("toggle-fullscreen"),
    },
  },
});

contextBridge.exposeInMainWorld("teleprompterBridge", {
  toggleOutputWindow: (displayId) => ipcRenderer.invoke("toggle-output-window", displayId),
  closeOutputWindow: () => ipcRenderer.invoke("close-output-window"),
  getOutputStatus: () => ipcRenderer.invoke("get-output-status"),
  selectOutputDisplay: (displayId) => ipcRenderer.invoke("select-output-display", displayId),
  sendState: (state) => ipcRenderer.send("teleprompter-state", state),
  onState: (callback) => {
    ipcRenderer.on("teleprompter-state", (_event, state) => callback(state));
  },
  onOutputStatus: (callback) => {
    ipcRenderer.on("output-window-status", (_event, state) => callback(state));
  },
  setGlobalShortcuts: (enabled) => ipcRenderer.invoke("set-global-shortcuts", Boolean(enabled)),
  onGlobalShortcut: (callback) => {
    ipcRenderer.on("global-shortcut", (_event, action) => callback(action));
  },
});
