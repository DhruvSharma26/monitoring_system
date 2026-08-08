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

        const targetUids = [device.device_uid, device.deviceId].filter(Boolean);

        const [latestStatus, alerts, tasks, staff, last7DaysSensorLogs, lastCompletedTask, completedTasks7Days] = await Promise.all([
            LatestDeviceStatus.findOne({ device_uid: { $in: targetUids } }).lean(),
            Alert.find({ device_uid: { $in: targetUids } }).sort({ createdAt: -1 }).limit(10).lean(),
            Task.find({ device: device._id }).populate("staff").sort({ createdAt: -1 }),
            User.findOne({ assignedDevice: device._id }).lean(),
            SensorData.find({
                device_uid: { $in: targetUids },
                timestamp: { $gte: sevenDaysAgo }
            }).sort({ timestamp: 1 }).lean(),
            Task.findOne({ device: device._id, status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] } }).populate("staff", "name empId userId").sort({ updatedAt: -1 }).lean(),
            Task.find({
                device: device._id,
                status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] },
                updatedAt: { $gte: sevenDaysAgo }
            }).lean()
        ]);

        let status = "clean";
        if (latestStatus) {
            if (latestStatus.feedback === 3 || latestStatus.OdorSensVal >= 50) status = "warning";
            if (latestStatus.feedback === 4 || latestStatus.OdorSensVal >= 80) status = "critical";
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
            let dayRating = 0.0;

            if (dayLogs.length > 0) {
                // Safely compute max counter without spread operator
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

        let totalUsage = latestStatus?.Counter || 0;
        for (const l of last7DaysSensorLogs) {
            const c = Number(l.Counter) || 0;
            if (c > totalUsage) totalUsage = c;
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