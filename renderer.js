function connect() {
    const ip = document.getElementById("serverIp").value;
    window.api.startAgent(ip);
}
