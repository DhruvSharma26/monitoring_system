const mongoose = require("mongoose");
const Device = require("../models/Device");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const SensorData = require("../models/SensorData");
const Task = require("../models/Task");
const User = require("../models/User");
const Assignment = require("../models/Assignment");
const ratingService = require("../services/ratingService");

const getToilets = async (req, res) => {
    try {
        const { status } = req.query;

        const adminId = req.user ? (req.user.id || req.user._id) : null;
        if (!adminId) {
            return res.status(200).json({
                success: true,
                count: 0,
                toilets: []
            });
        }

        const queryConditions = [{ adminId: adminId }];
        if (mongoose.Types.ObjectId.isValid(adminId)) {
            queryConditions.push({ adminId: new mongoose.Types.ObjectId(adminId) });
        }

        const adminDevices = await Device.find({ $or: queryConditions })
            .populate("assignedStaff", "name empId userId email")
            .sort({ createdAt: -1 })
            .lean();

        if (!adminDevices || adminDevices.length === 0) {
            return res.status(200).json({
                success: true,
                count: 0,
                toilets: []
            });
        }

        const devices = adminDevices;

        const Settings = require("../models/Settings");
        const [statuses, completedTasks, allActiveAssignments, settings] = await Promise.all([
            LatestDeviceStatus.find().lean(),
            Task.find({ status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] } })
                .populate("staff", "name empId userId")
                .sort({ updatedAt: -1 })
                .lean(),
            Assignment.find({ status: "ACTIVE" })
                .populate("staff", "name empId userId")
                .lean(),
            Settings.findOne({ adminId: req.user.id }).lean()
        ]);

        const userSettings = settings || (await Settings.findOne().lean());

        const statusMap = {};
        statuses.forEach(item => {
            if (item.device_uid) statusMap[item.device_uid.toLowerCase()] = item;
            if (item.deviceId) statusMap[item.deviceId.toLowerCase()] = item;
        });

        const toilets = [];

        for (const device of devices) {
            const devUids = [device.device_uid, device.deviceId, device._id ? device._id.toString() : null].filter(Boolean);
            let latestStatus = {};
            for (const u of devUids) {
                if (statusMap[u.toLowerCase()]) {
                    latestStatus = statusMap[u.toLowerCase()];
                    break;
                }
            }

            // 1. Resolve Assigned Staff (from Device.assignedStaff or active Assignment)
            let assignedStaffName = "Unassigned";
            let assignedStaffUserId = "";
            let assignedStaffEmpId = "";

            if (device.assignedStaff) {
                assignedStaffName = device.assignedStaff.name || "Assigned Staff";
                assignedStaffUserId = device.assignedStaff.userId || "";
                assignedStaffEmpId = device.assignedStaff.empId || "";
            } else {
                const activeAsgn = allActiveAssignments.find(a => a.device && String(a.device) === String(device._id));
                if (activeAsgn && activeAsgn.staff) {
                    assignedStaffName = activeAsgn.staff.name || "Assigned Staff";
                    assignedStaffUserId = activeAsgn.staff.userId || "";
                    assignedStaffEmpId = activeAsgn.staff.empId || "";
                }
            }

            // 2. Status Calculation (Clean, Warning, Critical) - NO "DIRTY"
            let toiletStatus = "clean";
            const latestDateStr = latestStatus.timestamp ? new Date(latestStatus.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;
            const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const isToday = Boolean(latestDateStr && latestDateStr === todayDateStr);

            if (isToday) {
                const { classifyTelemetry } = require("../services/alertClassifier");
                const classification = classifyTelemetry(
                    latestStatus.feedback,
                    latestStatus.Counter,
                    latestStatus.OdorSensVal,
                    userSettings
                );

                if (classification.status === "NEEDS_ATTENTION") {
                    toiletStatus = "warning";
                } else if (classification.status === "CRITICAL") {
                    toiletStatus = "critical";
                } else {
                    toiletStatus = "clean";
                }
            }

            // REMOVE "DIRTY" FILTER - Filter by requested status (clean, warning/needs attention, critical)
            if (status && status.toLowerCase() !== "all") {
                const reqSt = status.toLowerCase().trim();
                const currentSt = toiletStatus.toLowerCase();
                
                if (reqSt === "needs attention" || reqSt === "warning" || reqSt === "attention") {
                    if (currentSt !== "warning") continue;
                } else if (reqSt === "critical") {
                    if (currentSt !== "critical") continue;
                } else if (reqSt === "clean") {
                    if (currentSt !== "clean") continue;
                } else if (currentSt !== reqSt) {
                    continue;
                }
            }

            // 3. Compute Rolling Last 24-Hour Metrics
            const metrics24h = await ratingService.get24HourMetrics(devUids);

            // 4. Resolve Last Cleaned Info & Last Cleaned By Staff
            const deviceTask = completedTasks.find(t => String(t.device) === String(device._id));
            let lastCleanedAtFormatted = "Not cleaned yet";
            let lastCleanedByStaffName = "N/A";
            let lastCleanedByStaffUserId = "";
            let lastCleanedByStaffEmpId = "";

            if (deviceTask) {
                const cleanedDate = deviceTask.verifiedAt || deviceTask.completedAt || deviceTask.submittedAt || deviceTask.updatedAt;
                if (cleanedDate) {
                    lastCleanedAtFormatted = new Date(cleanedDate).toLocaleString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    });
                }
                if (deviceTask.staff) {
                    lastCleanedByStaffName = deviceTask.staff.name || "N/A";
                    lastCleanedByStaffUserId = deviceTask.staff.userId || "";
                    lastCleanedByStaffEmpId = deviceTask.staff.empId || "";
                }
            } else if (latestStatus && latestStatus.timestamp) {
                lastCleanedAtFormatted = new Date(latestStatus.timestamp).toLocaleString("en-US", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });
            }

            toilets.push({
                _id: device._id,
                deviceId: device.deviceId || device.device_uid,
                device_uid: device.device_uid,
                location: device.location || device.locationName || "Location",
                locationName: device.locationName || device.location || "Location",
                floor: device.floor || "Ground",
                status: toiletStatus,

                // Rolling 24 Hours Metrics
                last24Hours: {
                    averageRating: metrics24h.averageRating,
                    totalRatings: metrics24h.totalRatings,
                    totalUsage: metrics24h.totalUsage
                },
                averageRating: metrics24h.averageRating !== null ? metrics24h.averageRating : 5.0,
                rating: metrics24h.averageRating !== null ? metrics24h.averageRating : 5.0,
                totalRatings24h: metrics24h.totalRatings,
                totalUsage: metrics24h.totalUsage,
                usageToday: metrics24h.totalUsage,

                // Cleaning & Staff Info
                lastCleanedAt: lastCleanedAtFormatted,
                lastCleanedByStaffName: lastCleanedByStaffName,
                lastCleanedByStaffUserId: lastCleanedByStaffUserId,
                lastCleanedByStaffEmpId: lastCleanedByStaffEmpId,

                assignedStaffName: assignedStaffName,
                assignedStaffUserId: assignedStaffUserId,
                assignedStaffEmpId: assignedStaffEmpId,

                // Live Sensor snapshot
                feedback: latestStatus.feedback || 0,
                Counter: isToday ? (Number(latestStatus.Counter) || 0) : 0,
                OdorSensVal: isToday ? (Number(latestStatus.OdorSensVal) || 0) : 0,
                latitude: device.latitude,
                longitude: device.longitude,
                timestamp: latestStatus.timestamp || device.createdAt
            });
        }

        res.status(200).json({
            success: true,
            count: toilets.length,
            toilets
        });
    } catch (error) {
        console.error("Error in getToilets:", error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

module.exports = {
    getToilets
};
