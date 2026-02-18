const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const path = require("path");

let mainWindow;
let tray;
let agentModule;

function createWindow(showOnLaunch) {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 400,
        resizable: false,
        show: showOnLaunch,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    mainWindow.on("close", (event) => {
        event.preventDefault();
        mainWindow.hide();
    });
}

function createTray() {
    tray = new Tray(path.join(__dirname, "icon.png"));

    const contextMenu = Menu.buildFromTemplate([
        { label: "Open", click: () => mainWindow.show() },
        { label: "Exit", click: () => app.quit() }
    ]);

    tray.setToolTip("System Monitoring Agent");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => mainWindow.show());
}

async function startAgent(serverUrl) {
    if (!agentModule) {
        const agentPath = path.join(__dirname, "agent", "agent.js");
        agentModule = require(agentPath);
    }

    agentModule.stopAgent();
    agentModule.startAgent(serverUrl);
}

app.whenReady().then(() => {
    app.setLoginItemSettings({
        openAtLogin: true,
        args: ["--autostart"]
    });

    const isAutoStartLaunch = process.argv.includes("--autostart");

    createWindow(!isAutoStartLaunch);
    createTray();

    if (!isAutoStartLaunch) {
        mainWindow.show();
        mainWindow.focus();
    }
});

ipcMain.handle("save-server", async (event, serverUrl) => {
    startAgent(serverUrl);
    mainWindow.hide();
    return true;
});
