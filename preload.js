const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    saveServer: (config) => {
        return ipcRenderer.invoke("save-server", config);
    }
});