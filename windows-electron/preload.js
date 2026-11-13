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
  reportOutputViewport: (size) => ipcRenderer.invoke("output-viewport", size),
  getOutputStatus: () => ipcRenderer.invoke("get-output-status"),
  selectOutputDisplay: (displayId) => ipcRenderer.invoke("select-output-display", displayId),
  setKeepAwake: (active) => ipcRenderer.invoke("set-keep-awake", Boolean(active)),
  sendState: (state) => ipcRenderer.send("teleprompter-state", state),
  onState: (callback) => {
    ipcRenderer.on("teleprompter-state", (_event, state) => callback(state));
  },
  onOutputStatus: (callback) => {
    ipcRenderer.on("output-window-status", (_event, state) => callback(state));
  },
});
