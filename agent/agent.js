const WebSocket = require("ws");
const si = require("systeminformation");
const os = require("os");
const axios = require("axios");

let PC_ID = "UNKNOWN-PC";
let socket;
let metricsInterval;
let heartbeatInterval;
let dbInterval;
let reconnectTimeout;
let staticPayload;
let staticSentToDB = false;

let currentServerUrl;
let currentDbUrl;

const DB_INTERVAL = 10000;
let diskTick = 0;

const gb = bytes => Number((bytes / 1024 ** 3).toFixed(2));
const percent = v => v.toFixed(1) + " %";

async function resolvePcId() {
  try {
    PC_ID = `${os.hostname()} - ${os.userInfo().username}` || `PC-${Math.floor(Math.random() * 10000)}`;
  } catch {
    PC_ID = `PC-${Math.floor(Math.random() * 10000)}`;
  }
}

function convertWsToHttp(wsUrl) {
  const url = new URL(wsUrl);
  const protocol = url.protocol === "wss:" ? "https:" : "http:";
  return `${protocol}//${url.host}`;
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

async function sendStaticInfoToDB() {
  if (staticSentToDB || !staticPayload) return;

  try {
    await axios.post(`${currentDbUrl}/api/agent/register`, {
      pc_id: PC_ID,
      hostname: PC_ID,
      manufacturer: staticPayload.system.manufacturer,
      model: staticPayload.system.model,
      os_distro: staticPayload.os.distro,
      os_arch: staticPayload.os.arch,
      cpu_brand: staticPayload.cpu.brand,
      cpu_cores: staticPayload.cpu.cores,
      total_memory_gb: staticPayload.memory.total
    });

    staticSentToDB = true;
    console.log("Static info stored in DB");

  } catch (err) {
    console.error("Static DB error:", err.response?.data || err.message);
  }
}

async function sendDynamicInfoToDB() {
  try {
    const [load, mem, time, disks] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.time(),
      si.fsSize()
    ]);

    const payload = {
      pc_id: PC_ID,
      cpu_load: Number(load.currentLoad.toFixed(2)),
      memory_used: mem.used,
      memory_free: mem.available,
      memory_total: mem.total,
      uptime: Math.floor(time.uptime)
    };

    diskTick++;

    if (diskTick >= 6) {
      payload.disks = disks.map(d => ({
        mount: String(d.mount || ""),
        type: d.type || "Unknown",
        total_gb: gb(d.size),
        used_gb: gb(d.used),
        available_gb: gb(d.available),
        usage_percent: Number(d.use.toFixed(2))
      }));

      diskTick = 0;
    }

    await axios.post(`${currentDbUrl}/api/metrics`, payload);

  } catch (err) {
    console.error("Dynamic DB error:", err.response?.data || err.message);
  }
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
            upload: netlog ? (netlog.tx_sec / 1024).toFixed(2) : "0",
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
  clearInterval(dbInterval);
  clearTimeout(reconnectTimeout);

  metricsInterval = null;
  heartbeatInterval = null;
  dbInterval = null;
  reconnectTimeout = null;
}

function connect(serverUrl) {
  currentServerUrl = serverUrl;
  currentDbUrl = convertWsToHttp(serverUrl);

  console.log("Agent connecting to:", serverUrl);
  console.log("DB URL:", currentDbUrl);

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

    await sendStaticInfoToDB();
    dbInterval = setInterval(sendDynamicInfoToDB, DB_INTERVAL);

    sendHeartbeat();
    startFastMetrics();
    heartbeatInterval = setInterval(sendHeartbeat, 5000);
  };

  socket.onclose = () => {
    console.log("Disconnected. Reconnecting...");
    cleanupIntervals();
    staticSentToDB = false;
    reconnectTimeout = setTimeout(() => connect(currentServerUrl), 3000);
  };

  socket.onerror = err => {
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
  currentDbUrl = null;

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
