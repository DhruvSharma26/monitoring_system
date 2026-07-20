const mqtt = require('mqtt');
require('dotenv').config();

const client = mqtt.connect(process.env.MQTT_BROKER, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: "test_script_" + Math.random().toString(16).substr(2, 8)
});

client.on('connect', () => {
  console.log("Connected to MQTT, publishing...");
  const payload = {
    device_uid: "DEV_13",
    user_id: "USR_03",
    timestamp: new Date().toISOString(),
    feedback: 4, // CRITICAL
    Counter: 6,
    OdorSensVal: 15
  };
  client.publish("FeedBack/data", JSON.stringify(payload), { qos: 0 }, (err) => {
    if (err) console.error(err);
    else console.log("Published: ", payload);
    setTimeout(() => process.exit(0), 1000);
  });
});
