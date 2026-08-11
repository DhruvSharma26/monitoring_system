const mongoose = require("mongoose");
const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const User = require("../models/User");
const Alert = require("../models/Alert");
const Task = require("../models/Task");

const getToiletDetails = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(deviceId);
        const device = await Device.findOne({
            $or: isObjectId
                ? [{ _id: deviceId }, { deviceId }, { device_uid: deviceId }]
                : [{ deviceId }, { device_uid: deviceId }]
        }).lean();

        if (!device) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const targetUids = [device.device_uid, device.deviceId, device._id ? device._id.toString() : null].filter(Boolean);
        const regexUids = targetUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

        const Settings = require("../models/Settings");
        const [latestStatus, alerts, tasks, staff, last7DaysSensorLogs, lastCompletedTask, completedTasks7Days, settings] = await Promise.all([
            LatestDeviceStatus.findOne({
                $or: [{ device_uid: { $in: regexUids } }, { deviceId: { $in: regexUids } }]
            }).lean(),
            Alert.find({
                $or: [{ device_uid: { $in: regexUids } }, { deviceId: { $in: regexUids } }]
            }).sort({ createdAt: -1 }).limit(10).lean(),
            Task.find({ device: device._id }).populate("staff").sort({ createdAt: -1 }),
            User.findOne({ assignedDevice: device._id }).lean(),
            SensorData.find({
                $or: [{ device_uid: { $in: regexUids } }, { deviceId: { $in: regexUids } }],
                timestamp: { $gte: sevenDaysAgo }
            }).sort({ timestamp: 1 }).lean(),
            Task.findOne({ device: device._id, status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] } }).populate("staff", "name empId userId").sort({ updatedAt: -1 }).lean(),
            Task.find({
                device: device._id,
                status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] },
                updatedAt: { $gte: sevenDaysAgo }
            }).lean(),
            Settings.findOne({ adminId: req.user.id }).lean()
        ]);

        const userSettings = settings || (await Settings.findOne().lean());
        const odorThreshold = userSettings?.odorThreshold || 80;
        const counterThreshold = userSettings?.counterThreshold || 100;
        const warningOdorThreshold = Math.round(odorThreshold * 0.625);
        const warningCounterThreshold = Math.round(counterThreshold * 0.7);

        let status = "clean";
        if (latestStatus && latestStatus.timestamp) {
            const latestDateStr = new Date(latestStatus.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            if (latestDateStr === todayDateStr) {
                const odor = Number(latestStatus.OdorSensVal) || 0;
                const counter = Number(latestStatus.Counter) || 0;

                if (latestStatus.feedback === 3 || odor >= warningOdorThreshold || counter >= warningCounterThreshold) status = "warning";
                if (latestStatus.feedback === 4 || odor >= odorThreshold || counter >= counterThreshold) status = "critical";
            }
        }

        let lastCleanedByStaff = "Not yet cleaned today";
        let lastCleanedByStaffName = "";
        let lastCleanedByStaffUserId = "";
        let lastCleanedByStaffEmpId = "";

        if (lastCompletedTask) {
            const cleanedDate = lastCompletedTask.verifiedAt || lastCompletedTask.completedAt || lastCompletedTask.submittedAt || lastCompletedTask.updatedAt;
            if (cleanedDate) {
                lastCleanedByStaff = new Date(cleanedDate).toLocaleString("en-US", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });
            }
            if (lastCompletedTask.staff) {
                lastCleanedByStaffName = lastCompletedTask.staff.name || "";
                lastCleanedByStaffUserId = lastCompletedTask.staff.userId || "";
                lastCleanedByStaffEmpId = lastCompletedTask.staff.empId || "";
            }
        } else if (latestStatus && latestStatus.timestamp) {
            lastCleanedByStaff = new Date(latestStatus.timestamp).toLocaleString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
        }

        const feedbackToRating = (fb) => {
            if (fb === 1 || fb === 2) return 5.0;
            if (fb === 3) return 2.5;
            if (fb === 4) return 1.0;
            return 5.0;
        };

        const counterHistory = [];
        const odorHistory = [];
        const ratingHistory = [];
        const cleaningHistory = [];

        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date();
            dayStart.setDate(now.getDate() - i);
            dayStart.setHours(0, 0, 0, 0);

            const dayEnd = new Date();
            dayEnd.setDate(now.getDate() - i);
            dayEnd.setHours(23, 59, 59, 999);

            const dateStr = dayStart.toISOString().split("T")[0];
            const dayLabel = dayNames[dayStart.getDay()];

            const dayLogs = last7DaysSensorLogs.filter(log => {
                const logTime = new Date(log.timestamp).getTime();
                return logTime >= dayStart.getTime() && logTime <= dayEnd.getTime();
            });

            // Cleaning count per day from completed tasks
            const dayCleaningTasks = (completedTasks7Days || []).filter(task => {
                const taskDate = new Date(task.updatedAt || task.completedAt || task.verifiedAt || task.createdAt);
                const taskTime = taskDate.getTime();
                return taskTime >= dayStart.getTime() && taskTime <= dayEnd.getTime();
            });
            const dayCleaningCount = dayCleaningTasks.length;

            let dayCounter = 0;
            let dayOdor = 0;
            if (dayLogs.length > 0) {
                // Max / Peak counter for the day
                for (const l of dayLogs) {
                    const c = Number(l.Counter) || 0;
                    if (c > dayCounter) dayCounter = c;
                }

                // Average odor
                let sumOdor = 0;
                for (const l of dayLogs) {
                    sumOdor += Number(l.OdorSensVal) || 0;
                }
                dayOdor = Math.round(sumOdor / dayLogs.length);

                // Rating calculation
                const explicitLogs = dayLogs.filter(l => l.feedback !== undefined && l.feedback !== null && Number(l.feedback) > 0);
                if (explicitLogs.length > 0) {
                    const sumRating = explicitLogs.reduce((acc, l) => acc + feedbackToRating(Number(l.feedback)), 0);
                    dayRating = parseFloat((sumRating / explicitLogs.length).toFixed(1));
                } else {
                    const highOdor = dayLogs.some(l => (Number(l.OdorSensVal) || 0) >= 80);
                    const warningOdor = dayLogs.some(l => (Number(l.OdorSensVal) || 0) >= 50);
                    dayRating = highOdor ? 1.0 : (warningOdor ? 2.5 : 5.0);
                }
            } else if (i === 0 && latestStatus) {
                // Fallback for today if live telemetry exists
                dayCounter = Number(latestStatus.Counter) || 0;
                dayOdor = Number(latestStatus.OdorSensVal) || 0;
                if (latestStatus.feedback !== undefined && latestStatus.feedback > 0) {
                    dayRating = feedbackToRating(latestStatus.feedback);
                } else {
                    dayRating = dayOdor >= 80 ? 1.0 : (dayOdor >= 50 ? 2.5 : 5.0);
                }
            } else {
                dayCounter = 0;
                dayOdor = 0;
                dayRating = 0.0;
            }

            counterHistory.push({ day: dayLabel, date: dateStr, value: dayCounter });
            odorHistory.push({ day: dayLabel, date: dateStr, value: dayOdor });
            ratingHistory.push({ day: dayLabel, date: dateStr, value: dayRating });
            cleaningHistory.push({ day: dayLabel, date: dateStr, value: dayCleaningCount });
        }

        let averageRating = 5.0;
        if (last7DaysSensorLogs.length > 0) {
            const logsWithFeedback = last7DaysSensorLogs.filter(l => l.feedback !== undefined && l.feedback !== null && Number(l.feedback) > 0);
            if (logsWithFeedback.length > 0) {
                const sum = logsWithFeedback.reduce((acc, l) => acc + feedbackToRating(Number(l.feedback)), 0);
                averageRating = parseFloat((sum / logsWithFeedback.length).toFixed(1));
            } else if (latestStatus && latestStatus.feedback !== undefined && latestStatus.feedback > 0) {
                averageRating = feedbackToRating(latestStatus.feedback);
            }
        } else if (latestStatus && latestStatus.feedback !== undefined && latestStatus.feedback > 0) {
            averageRating = feedbackToRating(latestStatus.feedback);
        }

        const latestDateStr = latestStatus && latestStatus.timestamp ? new Date(latestStatus.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;
        const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const isLatestToday = Boolean(latestDateStr && latestDateStr === todayDateStr);

        let currentCounter = isLatestToday ? (Number(latestStatus?.Counter) || 0) : 0;
        let currentOdor = isLatestToday ? (Number(latestStatus?.OdorSensVal) || 0) : 0;
        let currentFeedback = isLatestToday ? (latestStatus?.feedback || 1) : 1;

        // Filter sensor logs strictly for today's date in IST
        const todaySensorLogs = last7DaysSensorLogs.filter(l => {
            const lDateStr = l.timestamp ? new Date(l.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;
            return lDateStr && lDateStr === todayDateStr;
        });

        if (todaySensorLogs.length > 0) {
            const maxTodayCounter = Math.max(...todaySensorLogs.map(l => Number(l.Counter) || 0));
            if (maxTodayCounter > currentCounter) currentCounter = maxTodayCounter;

            const maxTodayOdor = Math.max(...todaySensorLogs.map(l => Number(l.OdorSensVal) || 0));
            if (maxTodayOdor > currentOdor) currentOdor = maxTodayOdor;
        }

        let totalUsage = currentCounter;

        const liveSensorObj = {
            Counter: currentCounter,
            OdorSensVal: currentOdor,
            feedback: currentFeedback,
            timestamp: isLatestToday ? latestStatus.timestamp : new Date()
        };

        res.status(200).json({
            success: true,
            device,
            status,
            averageRating,
            totalUsage,
            latestSensor: liveSensorObj,
            currentCounter: currentCounter,
            currentOdor: currentOdor,
            lastCleanedByStaff,
            lastCleanedByStaffName,
            lastCleanedByStaffUserId,
            lastCleanedByStaffEmpId,
            weeklyAnalysis: {
                counterHistory,
                odorHistory,
                ratingHistory,
                cleaningHistory
            },
            staff,
            alerts,
            tasks,
            sensorHistory: last7DaysSensorLogs
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
            timestamp: now,
            date: dateStr,
            Counter: Counter !== undefined ? Number(Counter) : 0,
            OdorSensVal: OdorSensVal !== undefined ? Number(OdorSensVal) : 0,
            feedback: feedback !== undefined ? Number(feedback) : 1
        };

        await SensorData.create(sensorPayload);

        await LatestDeviceStatus.findOneAndUpdate(
            { $or: [{ device_uid: device.device_uid }, { deviceId: device.deviceId }] },
            { $set: sensorPayload },
            { upsert: true, new: true }
        );

        const Settings = require("../models/Settings");
        const settings = await Settings.findOne() || { counterThreshold: 100, odorThreshold: 80 };

        let alertType = null;
        if (sensorPayload.feedback === 4) alertType = "CRITICAL_FEEDBACK";
        else if (sensorPayload.feedback === 3) alertType = "WARNING_FEEDBACK";
        else if (sensorPayload.OdorSensVal > settings.odorThreshold) alertType = "HIGH_ODOR";
        else if (sensorPayload.Counter > settings.counterThreshold) alertType = "HIGH_USAGE";

        if (alertType) {
            const alertService = require("../services/alertService");
            const notificationService = require("../services/notificationService");

            const { alert: alertDoc, isOverwritten } = await alertService.processOrCreateDeviceAlert({
                device_uid: device.device_uid,
                deviceId: device.deviceId,
                alertType,
                feedback: sensorPayload.feedback,
                Counter: sensorPayload.Counter,
                OdorSensVal: sensorPayload.OdorSensVal
            });

            // Dispatch targeted notifications (DB, FCM Push, Sockets) ONLY to admin who registered device & assigned staff
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