const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayAPI", {
  onData: (callback) => ipcRenderer.on("overlay:data", (_e, data) => callback(data)),
  onSettings: (callback) => ipcRenderer.on("overlay:settings", (_e, data) => callback(data)),
  close: () => ipcRenderer.send("overlay:close"),
  dragStart: () => ipcRenderer.send("overlay:drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("overlay:drag-move", dx, dy),
});
