const mongoose = require("mongoose");
const Device = require("../models/Device");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const SensorData = require("../models/SensorData");
const Task = require("../models/Task");
const User = require("../models/User");
const Alert = require("../models/Alert");
const Settings = require("../models/Settings");
const ratingService = require("../services/ratingService");

const getToiletDetails = async (req, res) => {
    try {
        const { deviceId } = req.params;

        const isObjectId = mongoose.Types.ObjectId.isValid(deviceId);
        const device = await Device.findOne({
            $or: isObjectId
                ? [{ _id: deviceId }, { deviceId }, { device_uid: deviceId }]
                : [{ deviceId }, { device_uid: deviceId }]
        }).populate("assignedStaff", "name empId userId email mobile_number designation");

        if (!device) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        const devUids = [
            device.device_uid,
            device.deviceId,
            device._id ? device._id.toString() : null
        ].filter(Boolean);

        const regexUids = devUids.map(u => new RegExp(`^${u}$`, "i"));

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        // Fetch all relevant data concurrently
        const [
            allDeviceStatuses,
            sensorLogs,
            alertDocs,
            allCompletedTasks,
            assignedUser,
            settings
        ] = await Promise.all([
            LatestDeviceStatus.find().lean(),
            SensorData.find({
                $or: [
                    { device_uid: { $in: regexUids } },
                    { deviceId: { $in: regexUids } }
                ]
            }).sort({ timestamp: -1, createdAt: -1 }).lean(),
            Alert.find({
                $or: [
                    { device: device._id },
                    { device_uid: { $in: regexUids } },
                    { deviceId: { $in: regexUids } }
                ]
            }).sort({ createdAt: -1 }).lean(),
            Task.find({
                $or: [
                    { device: device._id },
                    { device_uid: { $in: regexUids } },
                    { deviceId: { $in: regexUids } }
                ],
                status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED", "SUBMITTED"] }
            }).populate("staff", "name empId userId email mobile_number").sort({ completedAt: -1, verifiedAt: -1, updatedAt: -1 }).lean(),
            User.findOne({ assignedDevice: device._id }).lean(),
            Settings.findOne({ adminId: req.user.id }).lean()
        ]);

        const userSettings = settings || (await Settings.findOne().lean()) || { counterThreshold: 100, odorThreshold: 200 };
        const odorThreshold = Number(userSettings?.odorThreshold) || 200;
        const counterThreshold = Number(userSettings?.counterThreshold) || 100;

        // Latest MQTT status
        let latestStatus = {};
        for (const item of allDeviceStatuses) {
            const matchUid = (item.device_uid && devUids.some(u => u.toLowerCase() === item.device_uid.toLowerCase())) ||
                             (item.deviceId && devUids.some(u => u.toLowerCase() === item.deviceId.toLowerCase()));
            if (matchUid) {
                latestStatus = item;
                break;
            }
        }

        // 1. Status Calculation: Driven by active open/assigned alerts & latest telemetry
        let status = "Clean";
        const openAlertsForDevice = (alertDocs || []).filter(a => a.status === "OPEN" || a.status === "ASSIGNED");
        if (openAlertsForDevice.length > 0) {
            const hasCritical = openAlertsForDevice.some(a => {
                const cat = (a.alertCategory || a.alertType || a.toiletStatus || "").toLowerCase();
                return cat.includes("critical");
            });
            status = hasCritical ? "Critical" : "Need Attention";
        } else {
            // No open or assigned alerts in assigned or not assigned tab -> Toilet is Clean!
            if (device.status === "clean" || (latestStatus && latestStatus.status === "clean")) {
                status = "Clean";
            } else if (latestStatus && (latestStatus.Counter !== undefined || latestStatus.OdorSensVal !== undefined || latestStatus.feedback !== undefined)) {
                const { classifyTelemetry } = require("../services/alertClassifier");
                const classification = classifyTelemetry(
                    latestStatus.feedback,
                    latestStatus.Counter ?? latestStatus.CounterValue,
                    latestStatus.OdorSensVal ?? latestStatus.OdorLevel,
                    userSettings
                );
                status = classification.toiletStatus || "Clean";
            } else {
                status = "Clean";
            }
        }

        // 2. Resolve Last Cleaned Task & Staff
        const alertMap = {};
        (alertDocs || []).forEach(a => { alertMap[String(a._id)] = a; });

        const lastCompletedTask = allCompletedTasks.find(t => {
            if (t.device && devUids.some(u => String(t.device).toLowerCase() === u.toLowerCase())) return true;
            if (t.deviceId && devUids.some(u => String(t.deviceId).toLowerCase() === u.toLowerCase())) return true;
            if (t.device_uid && devUids.some(u => String(t.device_uid).toLowerCase() === u.toLowerCase())) return true;
            if (t.alert && alertMap[String(t.alert)]) {
                const al = alertMap[String(t.alert)];
                if (al.device && devUids.some(u => String(al.device).toLowerCase() === u.toLowerCase())) return true;
                if (al.deviceId && devUids.some(u => String(al.deviceId).toLowerCase() === u.toLowerCase())) return true;
                if (al.device_uid && devUids.some(u => String(al.device_uid).toLowerCase() === u.toLowerCase())) return true;
            }
            return false;
        });

        let lastCleanedByStaff = "Not yet cleaned today";
        let lastCleanedDate = null;
        let lastCleanedByStaffName = "";
        let lastCleanedByStaffUserId = "";
        let lastCleanedByStaffEmpId = "";

        if (lastCompletedTask) {
            const cleanedDate = lastCompletedTask.completedAt || lastCompletedTask.verifiedAt || lastCompletedTask.submittedAt || lastCompletedTask.updatedAt;
            if (cleanedDate) {
                lastCleanedDate = new Date(cleanedDate).toISOString();
                lastCleanedByStaff = new Date(cleanedDate).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata"
                });
            }
            if (lastCompletedTask.staff) {
                lastCleanedByStaffName = lastCompletedTask.staff.name || "";
                lastCleanedByStaffUserId = lastCompletedTask.staff.userId || "";
                lastCleanedByStaffEmpId = lastCompletedTask.staff.empId || "";
            }
        } else if (latestStatus && latestStatus.timestamp) {
            lastCleanedDate = new Date(latestStatus.timestamp).toISOString();
            lastCleanedByStaff = new Date(latestStatus.timestamp).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Kolkata"
            });
        }

        // 3. Build Telemetry Fusion for 7-Day History
        const allTelemetry = [];
        (sensorLogs || []).forEach(s => {
            const dt = new Date(s.timestamp || s.createdAt);
            const istDate = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            allTelemetry.push({
                source: "sensor",
                istDate,
                timestamp: dt,
                Counter: Number(s.Counter ?? s.CounterValue ?? 0),
                Odor: Number(s.OdorSensVal ?? s.OdorLevel ?? 0),
                feedback: s.feedback
            });
        });

        (alertDocs || []).forEach(a => {
            const dt = new Date(a.createdAt || a.updatedAt);
            const istDate = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            allTelemetry.push({
                source: "alert",
                istDate,
                timestamp: dt,
                Counter: Number(a.Counter ?? a.counterValue ?? a.CounterValue ?? 0),
                Odor: Number(a.OdorSensVal ?? a.odorValue ?? a.OdorLevel ?? 0),
                feedback: a.feedback
            });
        });

        const now = new Date();
        const counterHistory = [];
        const odorHistory = [];
        const ratingHistory = [];
        const cleaningHistory = [];

        for (let i = 6; i >= 0; i--) {
            const targetDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const targetDateStr = targetDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            const dayLabel = targetDate.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" });

            // Telemetry for this IST day
            const dayTelemetries = allTelemetry.filter(t => t.istDate === targetDateStr);

            // Cleanings for this IST day
            const dayCleanings = (allCompletedTasks || []).filter(t => {
                const cDate = new Date(t.completedAt || t.verifiedAt || t.updatedAt || t.createdAt);
                const cIstDate = cDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                return cIstDate === targetDateStr;
            });

            let dayCounter = 0;
            let dayOdor = 0;
            let dayRating = 5.0;

            if (dayTelemetries.length > 0) {
                // Peak visitor counter
                for (const t of dayTelemetries) {
                    if (t.Counter > dayCounter) dayCounter = t.Counter;
                }

                // Average Odor (prioritize positive readings if present)
                const odorPositives = dayTelemetries.map(t => t.Odor).filter(o => o > 0);
                if (odorPositives.length > 0) {
                    dayOdor = Math.round(odorPositives.reduce((sum, v) => sum + v, 0) / odorPositives.length);
                } else {
                    const sumAll = dayTelemetries.reduce((sum, t) => sum + t.Odor, 0);
                    dayOdor = Math.round(sumAll / dayTelemetries.length);
                }

                // Rating Calculation
                const explicitFbs = dayTelemetries.filter(t => t.feedback !== undefined && t.feedback !== null && Number(t.feedback) > 0);
                if (explicitFbs.length > 0) {
                    const sumStars = explicitFbs.reduce((acc, l) => {
                        const fb = Number(l.feedback);
                        const stars = (fb === 1 || fb === 2) ? 5.0 : (fb === 3 ? 3.0 : 1.0);
                        return acc + stars;
                    }, 0);
                    dayRating = parseFloat((sumStars / explicitFbs.length).toFixed(1));
                } else {
                    dayRating = 5.0;
                }
            } else if (i === 0 && latestStatus) {
                // Fallback for today from live telemetry
                const curC = Number(latestStatus.Counter ?? latestStatus.CounterValue) || 0;
                const curO = Number(latestStatus.OdorSensVal ?? latestStatus.OdorLevel) || 0;
                dayCounter = curC;
                dayOdor = curO;
                const fb = Number(latestStatus.feedback) || 1;
                dayRating = (fb === 1 || fb === 2) ? 5.0 : (fb === 3 ? 3.0 : 1.0);
            } else {
                dayCounter = 0;
                dayOdor = 0;
                dayRating = 0.0;
            }

            counterHistory.push({ day: dayLabel, date: targetDateStr, value: dayCounter });
            odorHistory.push({ day: dayLabel, date: targetDateStr, value: dayOdor });
            ratingHistory.push({ day: dayLabel, date: targetDateStr, value: dayRating });
            cleaningHistory.push({ day: dayLabel, date: targetDateStr, value: dayCleanings.length });
        }

        // 4. Calculate 24-hour average rating using ratingService
        const metrics24h = await ratingService.get24HourMetrics(devUids);
        let averageRating = metrics24h.averageRating !== null ? metrics24h.averageRating : 5.0;

        const latestDateStr = latestStatus && latestStatus.timestamp ? new Date(latestStatus.timestamp).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null;
        const todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const isLatestToday = Boolean(latestDateStr && latestDateStr === todayDateStr);

        let currentCounter = isLatestToday ? (Number(latestStatus?.Counter ?? latestStatus?.CounterValue) || 0) : 0;
        let currentOdor = isLatestToday ? (Number(latestStatus?.OdorSensVal ?? latestStatus?.OdorLevel) || 0) : 0;
        let currentFeedback = isLatestToday ? (latestStatus?.feedback || 1) : 1;

        // Filter sensor logs strictly for today's date in IST
        const todaySensorLogs = (sensorLogs || []).filter(l => {
            const lDateStr = l.timestamp ? new Date(l.timestamp).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null;
            return lDateStr && lDateStr === todayDateStr;
        });

        if (todaySensorLogs.length > 0) {
            const maxTodayCounter = Math.max(...todaySensorLogs.map(l => Number(l.Counter ?? l.CounterValue) || 0));
            if (maxTodayCounter > currentCounter) currentCounter = maxTodayCounter;

            const maxTodayOdor = Math.max(...todaySensorLogs.map(l => Number(l.OdorSensVal ?? l.OdorLevel) || 0));
            if (maxTodayOdor > currentOdor) currentOdor = maxTodayOdor;
        }

        let totalUsage = currentCounter;

        const liveSensorObj = {
            Counter: currentCounter,
            CounterValue: currentCounter,
            OdorSensVal: currentOdor,
            OdorLevel: currentOdor,
            feedback: currentFeedback,
            timestamp: isLatestToday ? latestStatus.timestamp : new Date()
        };

        const resolvedStaff = device.assignedStaff || assignedUser || null;

        res.status(200).json({
            success: true,
            device,
            status,
            averageRating,
            totalUsage,
            latestSensor: liveSensorObj,
            currentCounter: currentCounter,
            currentCounterValue: currentCounter,
            currentOdor: currentOdor,
            currentOdorLevel: currentOdor,

            // Last Cleaned information
            lastCleaned: lastCleanedByStaff,
            lastCleanedAt: lastCleanedByStaff,
            lastCleanedDate: lastCleanedDate,
            lastCleanedTimestamp: lastCleanedDate,
            lastCleanedByStaff,
            lastCleanedByStaffName,
            lastCleanedByStaffUserId,
            lastCleanedByStaffEmpId,

            // Staff assignment
            assignedStaffName: resolvedStaff?.name || "",
            assignedStaffUserId: resolvedStaff?.userId || "",
            assignedStaffEmpId: resolvedStaff?.empId || "",

            weeklyAnalysis: {
                counterHistory,
                odorHistory,
                ratingHistory,
                cleaningHistory
            },
            counterHistory,
            odorHistory,
            ratingHistory,
            cleaningHistory,
            staff: resolvedStaff,
            alerts: alertDocs,
            tasks: allCompletedTasks,
            sensorHistory: sensorLogs
        });
    } catch (error) {
        console.error("Error in getToiletDetails:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const markToiletClean = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(deviceId);
        const device = await Device.findOne({
            $or: isObjectId
                ? [{ _id: deviceId }, { deviceId }, { device_uid: deviceId }]
                : [{ deviceId }, { device_uid: deviceId }]
        });
        if (!device) return res.status(404).json({ success: false, message: "Device not found" });

        const cleanNow = new Date();
        const yyyyC = cleanNow.getFullYear();
        const mmC = String(cleanNow.getMonth() + 1).padStart(2, '0');
        const ddC = String(cleanNow.getDate()).padStart(2, '0');
        const cleanDateStr = `${yyyyC}-${mmC}-${ddC}`;

        await LatestDeviceStatus.findOneAndUpdate(
            { $or: [{ device_uid: device.device_uid }, { deviceId: device.deviceId }] },
            { $set: { feedback: 0, Counter: 0, OdorSensVal: 0, timestamp: cleanNow, date: cleanDateStr } },
            { upsert: true, new: true }
        );

        await SensorData.create({
            device_uid: device.device_uid,
            deviceId: device.deviceId,
            feedback: 0,
            Counter: 0,
            OdorSensVal: 0,
            timestamp: cleanNow,
            date: cleanDateStr
        });

        res.status(200).json({ success: true, message: "Toilet marked as clean" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const postToiletTelemetry = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { Counter, OdorSensVal, feedback } = req.body;

        const isObjectId = mongoose.Types.ObjectId.isValid(deviceId);
        const device = await Device.findOne({
            $or: isObjectId
                ? [{ _id: deviceId }, { deviceId }, { device_uid: deviceId }]
                : [{ deviceId }, { device_uid: deviceId }]
        });

        if (!device) return res.status(404).json({ success: false, message: "Device not found" });

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const sensorPayload = {
            device_uid: device.device_uid,
            deviceId: device.deviceId,
            device: device._id,
            Counter: Number(Counter) || 0,
            CounterValue: Number(Counter) || 0,
            OdorSensVal: Number(OdorSensVal) || 0,
            OdorLevel: Number(OdorSensVal) || 0,
            feedback: Number(feedback) || 0,
            timestamp: now,
            date: dateStr
        };

        await SensorData.create(sensorPayload);

        await LatestDeviceStatus.findOneAndUpdate(
            { $or: [{ device_uid: device.device_uid }, { deviceId: device.deviceId }] },
            { $set: sensorPayload },
            { upsert: true, new: true }
        );

        const Settings = require("../models/Settings");
        const adminSettings = device.adminId ? await Settings.findOne({ adminId: device.adminId }).lean() : await Settings.findOne().lean();
        const settings = adminSettings || { counterThreshold: 100, odorThreshold: 200 };

        const { classifyTelemetry } = require("../services/alertClassifier");
        const classification = classifyTelemetry(
            sensorPayload.feedback,
            sensorPayload.Counter,
            sensorPayload.OdorSensVal,
            settings
        );

        if (classification.status !== "CLEAN" && classification.alertCategory) {
            const alertService = require("../services/alertService");
            const notificationService = require("../services/notificationService");

            const { alert: alertDoc, isOverwritten } = await alertService.processOrCreateDeviceAlert({
                device_uid: device.device_uid,
                deviceId: device.deviceId,
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

            const alertType = classification.alertType;

            await notificationService.handleMqttAlertNotification(sensorPayload, alertType, alertDoc);

            if (global.io) {
                const socketPayload = {
                    device_uid: device.device_uid,
                    alert_id: alertDoc._id,
                    type: alertType,
                    feedback: sensorPayload.feedback,
                    isOverwritten
                };
                global.io.emit("new_alert", socketPayload);
                if (device.adminId) {
                    global.io.to(`user_${device.adminId}`).emit("new_alert", socketPayload);
                }
                if (device.assignedStaff) {
                    global.io.to(`user_${device.assignedStaff}`).emit("new_alert", socketPayload);
                }
            }
        }

        if (global.io) {
            global.io.emit("device_status_update", sensorPayload);
        }

        res.status(200).json({ success: true, message: "Telemetry recorded successfully", data: sensorPayload });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getToiletDetails,
    markToiletClean,
    postToiletTelemetry
};
