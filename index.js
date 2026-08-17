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
const assignmentRoutes = require("./routes/assignmentRoutes");
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

io.on("connection", (socket) => {
  console.log(`🔌 Socket Connected: ${socket.id}`);

  socket.on("join", (userId) => {
    if (userId) {
      const room = userId.startsWith("user_") ? userId : `user_${userId}`;
      socket.join(room);
      console.log(`🔌 Socket ${socket.id} joined room ${room}`);
    }
  });

  socket.on("join_room", (room) => {
    if (room) {
      const formattedRoom = room.startsWith("user_") ? room : `user_${room}`;
      socket.join(formattedRoom);
      console.log(`🔌 Socket ${socket.id} joined room ${formattedRoom}`);
    }
  });
});

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
app.use("/api/assignments", assignmentRoutes);
app.use("/assignments", assignmentRoutes);

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
  let activeBroker = MQTT_BROKER;
  let hasFallenBack = false;

  const createClient = (brokerUrl, useAuth = true) => {
    const options = {
      clientId: "node_backend_" + Math.random().toString(16).slice(2, 8),
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      rejectUnauthorized: false, // Prevents TLS issues on hosted environments
      protocolVersion: 4, // Explicitly use MQTT 3.1.1
    };

    if (useAuth && MQTT_USERNAME) {
      options.username = MQTT_USERNAME;
      options.password = MQTT_PASSWORD;
    }

    console.log("🔌 Connecting to MQTT Broker:", brokerUrl);
    return mqtt.connect(brokerUrl, options);
  };

  let client = createClient(activeBroker);

  const setupClientListeners = (clientInstance) => {
    clientInstance.on("connect", () => {
      console.log(`✅ MQTT Connected successfully to: ${activeBroker}`);

      MQTT_TOPICS.forEach((topic) => {
        clientInstance.subscribe(topic, (err) => {
          if (err) {
            console.log(`❌ Subscription Error on ${topic}:`, err.message);
          } else {
            console.log(`📡 Subscribed -> ${topic}`);
          }
        });
      });
    });

    clientInstance.on("message", async (topic, message) => {
      try {
        const raw = message.toString();
        console.log(`📨 MQTT Topic: ${topic}`);

        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = { rawMessage: raw };
        }

        const du = payload.device_uid ?? payload.deviceId ?? payload.device_id;
        const f = payload.feedback ?? payload.FeedBack ?? payload.Feedback ?? payload.feedBack;
        const c = payload.Counter ?? payload.counter ?? payload.CounterValue;
        const o = payload.OdorSensVal ?? payload.odorSensVal ?? payload.odor ?? payload.Odor ?? payload.OdorLevel;

        if (!du) {
          console.log("⚠️ Missing device identifier in payload:", raw);
          return;
        }

        const parseMqttTimestamp = (ts) => {
          if (!ts) return new Date();
          if (ts instanceof Date) return ts;
          if (typeof ts === 'number') {
            return new Date(ts < 1e11 ? ts * 1000 : ts);
          }
          if (typeof ts === 'string') {
            let cleanStr = ts.trim();
            if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(cleanStr)) {
              cleanStr = cleanStr.replace(' ', 'T');
            }
            const parsed = new Date(cleanStr);
            if (!isNaN(parsed.getTime())) return parsed;
          }
          return new Date();
        };

        const getISTDateString = (dateInput) => {
          const d = parseMqttTimestamp(dateInput);
          if (isNaN(d.getTime())) return null;
          return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        };

        const isTodayIST = (dateInput) => {
          if (!dateInput) return true;
          const inputDateStr = getISTDateString(dateInput);
          const todayDateStr = getISTDateString(new Date());
          return Boolean(inputDateStr && inputDateStr === todayDateStr);
        };

        const recordTimestamp = parseMqttTimestamp(payload.timestamp);
        const dateStr = getISTDateString(recordTimestamp) || new Date().toISOString().split('T')[0];

        const sensorPayload = {
          device_uid: du,
          user_id: payload.user_id ?? payload.userId,
          timestamp: recordTimestamp,
          date: dateStr,
          feedback: f !== undefined ? Number(f) : undefined,
          Counter: c !== undefined ? Number(c) : undefined,
          OdorSensVal: o !== undefined ? Number(o) : undefined
        };

        // Always save historical data for graphs, reports, and average ratings
        await SensorData.create(sensorPayload);
        try {
          const ratingService = require("./services/ratingService");
          await ratingService.recordParticularRating({
            device_uid: du,
            device: targetDev ? targetDev._id : null,
            timestamp: recordTimestamp,
            counter: sensorPayload.Counter,
            odor: sensorPayload.OdorSensVal,
            feedback: sensorPayload.feedback
          });
        } catch (rErr) {
          console.log("Error recording particular rating:", rErr.message);
        }
        console.log(`💾 Historical SensorData saved for device ${du} (date: ${dateStr})`);

        // Check if timestamp belongs to current day (IST)
        const isCurrentDayEvent = isTodayIST(payload.timestamp);
        if (!isCurrentDayEvent) {
          console.log(`ℹ️ MQTT payload timestamp [${payload.timestamp}] date (${getISTDateString(payload.timestamp)}) is NOT today (${getISTDateString(new Date())}) in IST — Saved to historical SensorData for reports/graphs, but skipping live status update & alert creation.`);
          return;
        }

        // Update latest device state ONLY for current-day events
        await LatestDeviceStatus.findOneAndUpdate(
          { device_uid: du },
          { $set: sensorPayload },
          { upsert: true, new: true }
        );

        console.log(`📡 Updated LatestDeviceStatus for device ${du} with today's live data`);

        // 1. Emit live status WebSocket event to all connected clients
        if (global.io) {
          global.io.emit("device_status_update", sensorPayload);
        }

        // 2. Evaluate Alerts & Thresholds for Current-Day Events
        const targetDev = await Device.findOne({
          $or: [{ device_uid: sensorPayload.device_uid }, { deviceId: sensorPayload.device_uid }]
        });

        const adminSettings = (targetDev && targetDev.adminId)
          ? await Settings.findOne({ adminId: targetDev.adminId })
          : await Settings.findOne();

        const settings = adminSettings || { counterThreshold: 100, odorThreshold: 200 };

        const { classifyTelemetry } = require("./services/alertClassifier");
        const classification = classifyTelemetry(
          sensorPayload.feedback,
          sensorPayload.Counter,
          sensorPayload.OdorSensVal,
          settings
        );

        const alertService = require("./services/alertService");

        if (classification.status !== "CLEAN" && classification.alertCategory) {
          const { alert: alertDoc, device: dev, isOverwritten } = await alertService.processOrCreateDeviceAlert({
            device_uid: sensorPayload.device_uid,
            alertCategory: classification.alertCategory,
            alertType: classification.alertType,
            toiletStatus: classification.status,
            description: classification.description,
            feedback: sensorPayload.feedback,
            Counter: sensorPayload.Counter,
            OdorSensVal: sensorPayload.OdorSensVal,

            counterThreshold: classification.counterThreshold,
            odorThreshold: classification.odorThreshold,
            counterValue: classification.counterValue,
            odorValue: classification.odorValue,
            feedbackValue: classification.feedbackValue,

            counterSeverity: classification.counterSeverity,
            odorSeverity: classification.odorSeverity,
            feedbackSeverity: classification.feedbackSeverity,

            triggeredValues: classification.triggeredValues
          });

          const finalDev = dev || targetDev;
          if (finalDev) {
            finalDev.status = classification.status === "CRITICAL" ? "critical" : "warning";
            await finalDev.save();
          }

          const alertSocketData = {
            device_uid: sensorPayload.device_uid,
            alert_id: alertDoc._id,
            category: classification.alertCategory,
            type: classification.alertType,
            status: classification.status,
            description: classification.description,
            message: classification.description,
            feedback: sensorPayload.feedback,
            isOverwritten: isOverwritten
          };

          if (global.io) {
            global.io.emit("new_alert", alertSocketData);
            if (finalDev && finalDev.adminId) {
              global.io.to(`user_${finalDev.adminId}`).emit("new_alert", alertSocketData);
            }
            if (finalDev && finalDev.assignedStaff) {
              global.io.to(`user_${finalDev.assignedStaff}`).emit("new_alert", alertSocketData);
            }
          }

          try {
            await notificationService.handleMqttAlertNotification(sensorPayload, classification.alertType, alertDoc);
          } catch (nErr) {
            console.log("Notification error:", nErr.message);
          }
        } else {
          await alertService.resolveOpenAlertsForDevice(sensorPayload.device_uid);
          if (targetDev) {
            targetDev.status = "clean";
            await targetDev.save();
          }
        }
        }

      } catch (error) {
        console.log("❌ MQTT Processing Error:", error.message);
      }
    });

    clientInstance.on("error", (err) => {
      console.log("❌ MQTT Error:", err.message);

      // Fallback to public EMQX broker if custom broker fails auth / connection
      if (!hasFallenBack && (err.message.includes("Not authorized") || err.message.includes("connack timeout"))) {
        hasFallenBack = true;
        console.log("⚠️ Primary MQTT broker failed. Falling back to public broker (mqtt://broker.emqx.io:1883)...");
        clientInstance.end(true);
        activeBroker = "mqtt://broker.emqx.io:1883";
        client = createClient(activeBroker, false);
        setupClientListeners(client);
      }
    });
  };

  setupClientListeners(client);
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