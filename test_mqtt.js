const mqtt = require("mqtt");
const wssUrl = "mqtt://x6b6366b.ala.asia-southeast1.emqxsl.com:1883";
const options = {
    username: "pksaini486",
    password: "Password@1",
    clientId: "test_ws_" + Math.random().toString(16).slice(2, 8),
    clean: true,
    connectTimeout: 5000,
};
console.log("Connecting to", wssUrl);
const client = mqtt.connect(wssUrl, options);
client.on("connect", () => {
    console.log("✅ Successfully connected!");
    client.end();
});
client.on("error", (err) => {
    console.error("❌ Error:", err);
    client.end();
});
