const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("webkit", {
  messageHandlers: {
    nativeFullscreen: {
      postMessage: () => ipcRenderer.invoke("toggle-fullscreen"),
    },
  },
});

contextBridge.exposeInMainWorld("teleprompterBridge", {
  toggleOutputWindow: () => ipcRenderer.invoke("toggle-output-window"),
  closeOutputWindow: () => ipcRenderer.invoke("close-output-window"),
  sendState: (state) => ipcRenderer.send("teleprompter-state", state),
  onState: (callback) => {
    ipcRenderer.on("teleprompter-state", (_event, state) => callback(state));
  },
  onOutputStatus: (callback) => {
    ipcRenderer.on("output-window-status", (_event, state) => callback(state));
  },
});
