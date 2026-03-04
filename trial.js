async function sendMetrics() {
    try {
        const [load, mem, time, disks, stats] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.time(),
            si.fsSize(),
            si.networkStats()
        ]);

        const netlog = stats[0];
        console.log("NETWORK:", netlog);
        const payload = {

            pc_id: PC_ID,

            cpu_load: Number(load.currentLoad.toFixed(2)),

            memory_used: mem.used,
            memory_free: mem.available,
            memory_total: mem.total,

            uptime: Math.floor(time.uptime),

            upload: netlog ? Number((netlog.tx_sec / 1024).toFixed(2)) : 0,
            download: netlog ? Number((netlog.rx_sec / 1024).toFixed(2)) : 0

        };
        } catch (err) {
    
            console.error("Metrics error:", err.message);
        }
    
    
    
        console.log("sendMetrics function:", sendMetrics);
    }