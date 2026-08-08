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
const Settings = require("./models/Settings");
const Device = require("./models/Device");
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
const notificationRoutes = require("./routes/notificationRoutes");
const notificationService = require("./services/notificationService");
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

const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
connectDB();
const { startCleanupJob } = require("./services/cleanupService");
startCleanupJob();

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
app.use("/api/notifications", notificationRoutes);

app.get(["/", "/health", "/api/health"], (req, res) => {
  const mongoose = require("mongoose");
  const dbStatus = mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED";
  const statusCode = dbStatus === "CONNECTED" ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === "CONNECTED" ? "healthy" : "unhealthy",
    service: "Toilet Monitoring API",
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
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
    connectTimeout: 30000,
    rejectUnauthorized: false, // Prevents TLS issues on hosted environments
    protocolVersion: 4, // Explicitly use MQTT 3.1.1
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

        const du = payload.device_uid ?? payload.deviceId ?? payload.device_id;
        const f = payload.feedback ?? payload.FeedBack ?? payload.Feedback ?? payload.feedBack;
        const c = payload.Counter ?? payload.counter ?? payload.CounterValue;
        const o = payload.OdorSensVal ?? payload.odorSensVal ?? payload.odor ?? payload.Odor ?? payload.OdorLevel;
        
        if (!du) {
          console.log("⚠️ Missing device identifier in payload:", raw);
          return; // Don't process if we don't know the device
        }

        const sensorPayload = {
          device_uid: du,
          user_id: payload.user_id ?? payload.userId,
          timestamp: payload.timestamp ?? new Date(),
          feedback: f !== undefined ? Number(f) : undefined,
          Counter: c !== undefined ? Number(c) : undefined,
          OdorSensVal: o !== undefined ? Number(o) : undefined
        };

// Save historical data
await SensorData.create(
  sensorPayload
);

// Update latest device state
await LatestDeviceStatus.findOneAndUpdate(
{
  device_uid:
    du
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
  
  const settings = await Settings.findOne() || { counterThreshold: 100, odorThreshold: 80 };
  
  let alertType = null;
  let alertMessage = "";

  if (sensorPayload.feedback === 4) {
    alertType = "CRITICAL_FEEDBACK";
    alertMessage = "Critical";
  } else if (sensorPayload.feedback === 3) {
    alertType = "WARNING_FEEDBACK";
    alertMessage = "Needs Attention";
  } else if (sensorPayload.OdorSensVal > settings.odorThreshold) {
    alertType = "HIGH_ODOR";
    alertMessage = "High Odor Value";
  } else if (sensorPayload.Counter > settings.counterThreshold) {
    alertType = "HIGH_USAGE";
    alertMessage = "High Counter Value";
  }

  if (alertType) {
    const alertService = require("./services/alertService");
    const { alert: alertDoc, device: dev, isOverwritten } = await alertService.processOrCreateDeviceAlert({
      device_uid: sensorPayload.device_uid,
      alertType: alertType,
      feedback: sensorPayload.feedback,
      Counter: sensorPayload.Counter,
      OdorSensVal: sensorPayload.OdorSensVal
    });

    const alertSocketData = {
      device_uid: sensorPayload.device_uid,
      alert_id: alertDoc._id,
      type: alertType,
      message: alertMessage,
      feedback: sensorPayload.feedback,
      isOverwritten: isOverwritten
    };

    const targetDev = dev || await Device.findOne({ device_uid: sensorPayload.device_uid });
    if (targetDev && targetDev.adminId) {
      global.io.to(`user_${targetDev.adminId}`).emit("new_alert", alertSocketData);
    }
    if (targetDev && targetDev.assignedStaff) {
      global.io.to(`user_${targetDev.assignedStaff}`).emit("new_alert", alertSocketData);
    }

    // Send notifications to Admin and Assigned Staff (FCM Push, DB, Socket, Email)
    notificationService.handleMqttAlertNotification(sensorPayload, alertType, alertDoc);
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