require("dotenv").config();

const mqtt = require("mqtt");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const { apiLimiter } = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const otpRoutes = require("./routes/otpRoutes");
const deviceRoutes =
    require("./routes/deviceRoutes");
    const staffRoutes =
require("./routes/staffRoutes");
const passwordRoutes =
require("./routes/passwordRoutes");
const settingsRoutes =
require("./routes/settingsRoutes");
const SensorData = require("./models/SensorData");
const LatestDeviceStatus = require("./models/LatestDeviceStatus");
const Alert = require("./models/Alert");
const dashboardRoutes =
require("./routes/dashboardRoutes");
const taskRoutes =
require("./routes/taskRoutes");
const toiletRoutes =
require("./routes/toiletRoutes");
const toiletDashboardRoutes =
require(
"./routes/toiletDashboardRoutes"
);
const alertRoutes =
require("./routes/alertRoutes");
const reportRoutes =
require("./routes/reportRoutes");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
global.io = io; // Make io globally accessible

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

connectDB();

app.use(helmet());
app.use((req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  if (req.headers) req.headers = mongoSanitize.sanitize(req.headers);
  if (req.query) mongoSanitize.sanitize(req.query); // Mutates in place without reassignment
  next();
});
app.use(apiLimiter);

app.use("/api/auth", authRoutes);
app.use(
    "/api/devices",
    deviceRoutes
);
app.use(
    "/api/staff",
    staffRoutes
);
app.use(
    "/api/password",
    passwordRoutes
);
app.use(
    "/api/settings",
    settingsRoutes
);
app.use(
    "/api/dashboard",
    dashboardRoutes
);
app.use(
    "/api/tasks",
    taskRoutes
);
app.use(
    "/api/toilets",
    toiletRoutes
);
app.use(
    "/api/toilets",
    toiletDashboardRoutes
);
app.use(
    "/api/alerts",
    alertRoutes
);
app.use(
    "/api/reports",
    reportRoutes
);
app.use("/api/otp", otpRoutes);

app.get("/", (req, res) => {
  res.send("Toilet Monitoring Backend Running");
});

app.use(errorHandler);

// ───────────────────────────────────────────────────────────
// MQTT Configuration
// ───────────────────────────────────────────────────────────

const MQTT_BROKER =
  process.env.MQTT_BROKER ||
  "mqtt://broker.emqx.io:1883";

const MQTT_USERNAME =
  process.env.MQTT_USERNAME || "";

const MQTT_PASSWORD =
  process.env.MQTT_PASSWORD || "";

const MQTT_TOPICS =
  (process.env.MQTT_TOPICS || "Feedback/data,FeedBack/data")
    .split(",")
    .map((t) => t.trim());

// ───────────────────────────────────────────────────────────
// MQTT Connection
// ───────────────────────────────────────────────────────────

function connectMQTT() {
  const options = {
    clientId:
      "node_backend_" +
      Math.random().toString(16).slice(2, 8),

    clean: true,

    reconnectPeriod: 3000,
  };

  if (MQTT_USERNAME) {
    options.username = MQTT_USERNAME;
    options.password = MQTT_PASSWORD;
  }

  console.log(
    "🔌 Connecting to MQTT:",
    MQTT_BROKER
  );

  const client = mqtt.connect(
    MQTT_BROKER,
    options
  );

  client.on("connect", () => {
    console.log("✅ MQTT Connected");

    MQTT_TOPICS.forEach((topic) => {
      client.subscribe(topic, (err) => {
        if (err) {
          console.log(
            "❌ Subscription Error:",
            err.message
          );
        } else {
          console.log(
            `📡 Subscribed -> ${topic}`
          );
        }
      });
    });
  });

  client.on(
    "message",
    async (topic, message) => {
      try {
        const raw = message.toString();

        console.log(
          `📨 Topic: ${topic}`
        );

        let payload;

        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {
            rawMessage: raw,
          };
        }

        const sensorPayload = {

  device_uid:
    payload.device_uid,

  user_id:
    payload.user_id,

  timestamp:
    payload.timestamp,

  feedback:
    payload.feedback !== undefined ? Number(payload.feedback) : undefined,

  Counter:
    payload.Counter !== undefined ? Number(payload.Counter) : undefined,

  OdorSensVal:
    payload.OdorSensVal !== undefined ? Number(payload.OdorSensVal) : undefined

};

// Save historical data
await SensorData.create(
  sensorPayload
);

// Update latest device state
await LatestDeviceStatus.findOneAndUpdate(
{
  device_uid:
    payload.device_uid
},
{
  $set: sensorPayload
},
{
  upsert: true,
  new: true
}
);

console.log(
  "💾 Sensor data & device status saved"
);

// Emit WebSocket event to frontend
if (global.io) {
  global.io.emit("device_status_update", sensorPayload);
  
  let alertType = null;
  let alertMessage = "";

  if (sensorPayload.feedback === 4) {
    alertType = "CRITICAL_FEEDBACK";
    alertMessage = "Critical Feedback Received!";
  } else if (sensorPayload.feedback === 3) {
    alertType = "WARNING_FEEDBACK";
    alertMessage = "Warning Feedback Received!";
  } else if (sensorPayload.OdorSensVal > 80) {
    alertType = "HIGH_ODOR";
    alertMessage = "High Odor Detected!";
  } else if (sensorPayload.Counter > 100) {
    alertType = "HIGH_USAGE";
    alertMessage = "High Usage Detected!";
  }

  if (alertType) {
    const newAlert = await Alert.create({
      device_uid: sensorPayload.device_uid,
      alertType: alertType,
      feedback: sensorPayload.feedback,
      Counter: sensorPayload.Counter,
      OdorSensVal: sensorPayload.OdorSensVal,
      status: "OPEN"
    });
    console.log(`🚨 Alert Created: ${alertType} for device ${sensorPayload.device_uid}`);
    
    global.io.emit("new_alert", {
      device_uid: sensorPayload.device_uid,
      alert_id: newAlert._id,
      type: alertType,
      message: alertMessage,
      feedback: sensorPayload.feedback
    });
  }
}

      } catch (error) {

        console.log(
          "❌ MQTT Save Error:",
          error.message
        );

      }
    }
  );

  client.on("error", (err) => {
    console.log(
      "❌ MQTT Error:",
      err.message
    );
  });
}

connectMQTT();

// ───────────────────────────────────────────────────────────
// Express Server
// ───────────────────────────────────────────────────────────

const PORT =
  process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `🚀 Server Running on Port ${PORT}`
  );
  console.log(
    `🔌 WebSocket Server attached`
  );
});