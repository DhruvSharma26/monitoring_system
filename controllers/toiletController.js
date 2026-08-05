const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const LatestDeviceStatus =
require("../models/LatestDeviceStatus");
const User = require("../models/User");
const Alert = require("../models/Alert");
const Task = require("../models/Task");

const getToiletDetails = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await Device.findOne({ deviceId }).lean();
        if (!device) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const [latestStatus, alerts, tasks, staff, last7DaysSensorLogs, lastCompletedTask] = await Promise.all([
            LatestDeviceStatus.findOne({ device_uid: device.device_uid }).lean(),
            Alert.find({ device_uid: device.device_uid }).sort({ createdAt: -1 }).limit(10).lean(),
            Task.find({ device: device._id }).populate("staff").sort({ createdAt: -1 }),
            User.findOne({ assignedDevice: device._id }).lean(),
            SensorData.find({
                device_uid: device.device_uid,
                timestamp: { $gte: sevenDaysAgo }
            }).sort({ timestamp: 1 }).lean(),
            Task.findOne({ device: device._id, status: "COMPLETED" }).sort({ updatedAt: -1 }).lean()
        ]);

        let status = "clean";
        if (latestStatus) {
            if (latestStatus.feedback === 3) status = "warning";
            else if (latestStatus.feedback === 4) status = "critical";
        }

        let lastCleanedByStaff = "Not yet cleaned today";
        if (lastCompletedTask && lastCompletedTask.updatedAt) {
            lastCleanedByStaff = new Date(lastCompletedTask.updatedAt).toLocaleString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
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
            return 4.5;
        };

        const counterHistory = [];
        const odorHistory = [];
        const ratingHistory = [];

        const hashUid = (device.device_uid || device.deviceId || "dev").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            const dayLabel = dayNames[d.getDay()];

            const dayLogs = last7DaysSensorLogs.filter(log => {
                const logDate = new Date(log.timestamp).toISOString().split("T")[0];
                return logDate === dateStr;
            });

            let dayCounter, dayOdor, dayRating;

            if (dayLogs.length > 0) {
                dayCounter = Math.max(...dayLogs.map(l => l.Counter || 0));
                const sumOdor = dayLogs.reduce((acc, l) => acc + (l.OdorSensVal || 0), 0);
                dayOdor = Math.round(sumOdor / dayLogs.length);
                const sumRating = dayLogs.reduce((acc, l) => acc + feedbackToRating(l.feedback), 0);
                dayRating = parseFloat((sumRating / dayLogs.length).toFixed(1));
            } else {
                // REAL DYNAMIC DATA: No sensor logs for this day -> 0 (No fake static numbers)
                dayCounter = 0;
                dayOdor = 0;
                dayRating = 0;
            }

            counterHistory.push({ day: dayLabel, date: dateStr, value: dayCounter });
            odorHistory.push({ day: dayLabel, date: dateStr, value: dayOdor });
            ratingHistory.push({ day: dayLabel, date: dateStr, value: dayRating });
        }

        let averageRating = 5.0;
        if (last7DaysSensorLogs.length > 0) {
            const logsWithFeedback = last7DaysSensorLogs.filter(l => l.feedback !== undefined && l.feedback !== null);
            if (logsWithFeedback.length > 0) {
                const sum = logsWithFeedback.reduce((acc, l) => acc + feedbackToRating(l.feedback), 0);
                averageRating = parseFloat((sum / logsWithFeedback.length).toFixed(1));
            } else if (latestStatus && latestStatus.feedback !== undefined) {
                averageRating = feedbackToRating(latestStatus.feedback);
            }
        } else if (latestStatus && latestStatus.feedback !== undefined) {
            averageRating = feedbackToRating(latestStatus.feedback);
        }

        let totalUsage = latestStatus?.Counter || 0;
        if (last7DaysSensorLogs.length > 0) {
            const maxCounter = Math.max(...last7DaysSensorLogs.map(l => l.Counter || 0));
            totalUsage = Math.max(totalUsage, maxCounter);
        }

        res.status(200).json({
            success: true,
            device,
            status,
            averageRating,
            totalUsage,
            latestSensor: latestStatus || {
                Counter: latestStatus?.Counter || 0,
                OdorSensVal: latestStatus?.OdorSensVal || 0,
                feedback: latestStatus?.feedback || 1
            },
            currentCounter: latestStatus?.Counter || 0,
            currentOdor: latestStatus?.OdorSensVal || 0,
            lastCleanedByStaff,
            weeklyAnalysis: {
                counterHistory,
                odorHistory,
                ratingHistory
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
        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ success: false, message: "Device not found" });

        await LatestDeviceStatus.findOneAndUpdate(
            { device_uid: device.device_uid },
            { $set: { feedback: 0, Counter: 0, OdorSensVal: 0, timestamp: new Date() } },
            { upsert: true, new: true }
        );

        await SensorData.create({
            device_uid: device.device_uid,
            feedback: 0,
            Counter: 0,
            OdorSensVal: 0,
            timestamp: new Date()
        });

        res.status(200).json({ success: true, message: "Toilet marked as clean" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {

    getToiletDetails,
    markToiletClean

};