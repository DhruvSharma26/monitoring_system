const mqtt = require("mqtt");

const options = {
    username: "pksaini486",
    password: "Password@1",
    clientId: "test_ws_" + Math.random().toString(16).slice(2, 8),
    clean: true,
    connectTimeout: 30000,
    rejectUnauthorized: false
};

const wssUrl = "wss://x6b6366b.ala.asia-southeast1.emqxsl.com:8084/mqtt";
console.log("Connecting to", wssUrl);

const client = mqtt.connect(wssUrl, options);

client.on("connect", () => {
    console.log("✅ Successfully connected via WebSockets!");
    client.end();
});

client.on("error", (err) => {
    console.error("❌ Error:", err.message);
    client.end();
});
