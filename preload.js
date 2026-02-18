const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    saveServer: (url) => ipcRenderer.invoke("save-server", url)
});
