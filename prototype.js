const WebSocket = require("ws");
const si = require("systeminformation");
const os = require("os");
const axios = require("axios");

let PC_ID = "UNKNOWN-PC";
let socket;
let metricsInterval;
let heartbeatInterval;
let staticPayload;
let reconnectTimeout;
let currentServerUrl;

const gb = bytes => (bytes / 1024 ** 3).toFixed(2) + " GB";
const percent = v => v.toFixed(1) + " %";

async function resolvePcId() {
    try {
        PC_ID = `${os.hostname()} - ${os.userInfo().username}` || `PC-${Math.floor(Math.random() * 10000)}`;
    } catch {
        PC_ID = `PC-${Math.floor(Math.random() * 10000)}`;
    }
}

async function getStaticInfo() {
    const [system, cpu, osInfo, memory] = await Promise.all([
        si.system(),
        si.cpu(),
        si.osInfo(),
        si.mem()
    ]);

    return {
        system: {
            manufacturer: system.manufacturer,
            model: system.model
        },
        cpu: {
            brand: cpu.brand,
            cores: cpu.cores
        },
        os: {
            distro: osInfo.distro,
            arch: osInfo.arch
        },
        memory: {
            total: gb(memory.total)
        }
    };
}

function sendHeartbeat() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "HEARTBEAT",
            pcId: PC_ID
        }));
    }
}

function startFastMetrics() {
    metricsInterval = setInterval(async () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        try {
            const [load, memory, uptime, disks, nets, stats] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.time(),
                si.fsSize(),
                si.networkInterfaces(),
                si.networkStats()
            ]);

            const netlog = stats[0];
            const net = nets.find(n => !n.internal && n.ip4);

            socket.send(JSON.stringify({
                type: "SYSTEM_STATS",
                pcId: PC_ID,
                payload: {
                    timestamp: Date.now(),
                    uptime: uptime.uptime,
                    cpu: { load: Number(load.currentLoad.toFixed(2)) },
                    memory: {
                        used: memory.used,
                        free: memory.free,
                        total: memory.total
                    },
                    network: {
                        ip: net?.ip4 || "N/A",
                        mac: net?.mac || "N/A",
                        iface: net?.iface || "N/A",
                        Upload: netlog ? (netlog.tx_sec / 1024).toFixed(2) : "0",
                        download: netlog ? (netlog.rx_sec / 1024).toFixed(2) : "0"
                    },
                    disks: disks.map(d => ({
                        mount: d.mount,
                        type: d.type || "Unknown",
                        size: gb(d.size),
                        used: gb(d.used),
                        available: gb(d.available),
                        usage: percent(d.use)
                    }))
                }
            }));

        } catch (err) {
            console.error("Metric error:", err.message);
        }

    }, 1000);
}

function cleanupIntervals() {
    clearInterval(metricsInterval);
    clearInterval(heartbeatInterval);
    clearTimeout(reconnectTimeout);
    metricsInterval = null;
    heartbeatInterval = null;
    reconnectTimeout = null;
}

async function connect(serverUrl) {
    currentServerUrl = serverUrl;
    console.log("Agent connecting to:", serverUrl);

    socket = new WebSocket(serverUrl);

    socket.onopen = async () => {
        console.log("Agent connected:", PC_ID);

        if (!staticPayload) {
            staticPayload = await getStaticInfo();
        }

        socket.send(JSON.stringify({
            type: "REGISTER",
            pcId: PC_ID,
            payload: staticPayload
        }));

        sendHeartbeat();
        startFastMetrics();
        heartbeatInterval = setInterval(sendHeartbeat, 5000);
    };

    socket.onclose = () => {
        console.log("Disconnected. Reconnecting...");
        cleanupIntervals();
        reconnectTimeout = setTimeout(() => connect(currentServerUrl), 3000);
    };

    socket.onerror = (err) => {
        console.error("WebSocket error:", err.message);
    };
}

async function startAgent(serverUrl) {
    await resolvePcId();
    connect(serverUrl);
}

function stopAgent() {
    cleanupIntervals();
    currentServerUrl = null;

    if (socket) {
        try {
            socket.onclose = null;
            socket.close();
        } catch (err) {
            console.error("Socket close error:", err.message);
        }
    }

    socket = null;
}

module.exports = { startAgent, stopAgent };
