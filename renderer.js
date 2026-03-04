function isValidIP(ip) {
    const regex =
        /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ip);

}

function save() {

    const ip = document.getElementById("ip").value.trim();
    const portText = document.getElementById("port").value.trim();
    const port = Number(portText);

    if (!ip || !portText) {
        alert("Please enter server IP and port");
        return;
    }

    if (!isValidIP(ip)) {
        alert("Enter valid IPv4 address");
        return;
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        alert("Enter valid port (1-65535)");
        return;
    }

    const serverUrl = `ws://${ip}:${port}/ws`;
    const apiUrl = `http://${ip}:${port}`;

    document.getElementById("status").innerText = "Connecting to " + serverUrl;
    document.getElementById("connectBtn").disabled = true;
    window.api.saveServer({ serverUrl, apiUrl });
}