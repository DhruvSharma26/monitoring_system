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
        const Alert = require("../models/Alert");
        const [statuses, allAlerts, completedTasks, allActiveAssignments, settings] = await Promise.all([
            LatestDeviceStatus.find().lean(),
            Alert.find().lean(),
            Task.find({ status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED", "SUBMITTED"] } })
                .populate("staff", "name empId userId")
                .sort({ completedAt: -1, verifiedAt: -1, updatedAt: -1 })
                .lean(),
            Assignment.find({ status: "ACTIVE" })
                .populate("staff", "name empId userId")
                .lean(),
            Settings.findOne({ adminId: req.user.id }).lean()
        ]);

        const userSettings = settings || (await Settings.findOne().lean());
        const openAlerts = (allAlerts || []).filter(a => a.status === "OPEN" || a.status === "ASSIGNED");

        const alertMap = {};
        (allAlerts || []).forEach(a => {
            alertMap[String(a._id)] = a;
        });

        const statusMap = {};
        statuses.forEach(item => {
            if (item.device_uid) statusMap[item.device_uid.toLowerCase()] = item;
            if (item.deviceId) statusMap[item.deviceId.toLowerCase()] = item;
        });

        const toilets = [];

        for (const device of devices) {
            const devUids = [
                device.device_uid,
                device.deviceId,
                device._id ? device._id.toString() : null
            ].filter(Boolean);

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

            const latestDateStr = latestStatus.timestamp ? new Date(latestStatus.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;
            const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const isToday = Boolean(latestDateStr && latestDateStr === todayDateStr);

            // 2. Status Calculation: Driven by active open/assigned alerts & latest telemetry
            let toiletStatus = "Clean";
            const activeAlertsForDev = (openAlerts || []).filter(a => {
                const aDevId = String(a.device || '');
                const aUid = String(a.device_uid || '').toLowerCase();
                const aDeviceId = String(a.deviceId || '').toLowerCase();
                return (device._id && String(device._id) === aDevId) ||
                       devUids.some(u => u.toLowerCase() === aUid || u.toLowerCase() === aDeviceId);
            });

            if (activeAlertsForDev.length > 0) {
                const hasCritical = activeAlertsForDev.some(a => {
                    const cat = (a.alertCategory || a.alertType || a.toiletStatus || '').toLowerCase();
                    return cat.includes('critical');
                });
                toiletStatus = hasCritical ? "Critical" : "Need Attention";
            } else {
                // No open or assigned alerts in assigned or not assigned tab -> Toilet is Clean!
                if (device.status === "clean" || (latestStatus && latestStatus.status === "clean")) {
                    toiletStatus = "Clean";
                } else if (latestStatus && (latestStatus.Counter !== undefined || latestStatus.OdorSensVal !== undefined || latestStatus.feedback !== undefined)) {
                    const { classifyTelemetry } = require("../services/alertClassifier");
                    const classification = classifyTelemetry(
                        latestStatus.feedback,
                        latestStatus.Counter ?? latestStatus.CounterValue,
                        latestStatus.OdorSensVal ?? latestStatus.OdorLevel,
                        userSettings
                    );
                    toiletStatus = classification.toiletStatus || "Clean";
                } else {
                    toiletStatus = "Clean";
                }
            }

            // Case-insensitive status filter ("Clean", "Need Attention", "Critical")
            if (status && status.toLowerCase().trim() !== "all") {
                const reqSt = status.toLowerCase().trim();
                const currentSt = toiletStatus.toLowerCase().trim();
                
                if (reqSt === "needs attention" || reqSt === "need attention" || reqSt === "warning" || reqSt === "attention" || reqSt === "needs_attention" || reqSt === "need_attention") {
                    if (!currentSt.includes("attention") && currentSt !== "warning") continue;
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

            // 4. Resolve Last Cleaned Info & Last Cleaned By Staff with exhaustive fallback
            const deviceTask = completedTasks.find(t => {
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

            let lastCleanedAtFormatted = "Not cleaned yet";
            let lastCleanedDate = null;
            let lastCleanedByStaffName = "N/A";
            let lastCleanedByStaffUserId = "";
            let lastCleanedByStaffEmpId = "";

            if (deviceTask) {
                const cleanedDate = deviceTask.completedAt || deviceTask.verifiedAt || deviceTask.submittedAt || deviceTask.updatedAt;
                if (cleanedDate) {
                    lastCleanedDate = new Date(cleanedDate).toISOString();
                    lastCleanedAtFormatted = new Date(cleanedDate).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata"
                    });
                }
                if (deviceTask.staff) {
                    lastCleanedByStaffName = deviceTask.staff.name || "Staff Member";
                    lastCleanedByStaffUserId = deviceTask.staff.userId || "";
                    lastCleanedByStaffEmpId = deviceTask.staff.empId || "";
                }
            } else if (latestStatus && latestStatus.timestamp) {
                lastCleanedDate = new Date(latestStatus.timestamp).toISOString();
                lastCleanedAtFormatted = new Date(latestStatus.timestamp).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata"
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
                lastCleaned: lastCleanedAtFormatted,
                lastCleanedAt: lastCleanedAtFormatted,
                lastCleanedDate: lastCleanedDate,
                lastCleanedTimestamp: lastCleanedDate,
                lastCleanedByStaff: lastCleanedAtFormatted,
                lastCleanedByStaffName: lastCleanedByStaffName,
                lastCleanedByStaffUserId: lastCleanedByStaffUserId,
                lastCleanedByStaffEmpId: lastCleanedByStaffEmpId,

                assignedStaffName: assignedStaffName,
                assignedStaffUserId: assignedStaffUserId,
                assignedStaffEmpId: assignedStaffEmpId,

                // Live Sensor snapshot
                feedback: latestStatus.feedback || 0,
                Counter: isToday ? (Number(latestStatus.CounterValue ?? latestStatus.Counter) || 0) : 0,
                CounterValue: isToday ? (Number(latestStatus.CounterValue ?? latestStatus.Counter) || 0) : 0,
                OdorSensVal: isToday ? (Number(latestStatus.OdorLevel ?? latestStatus.OdorSensVal) || 0) : 0,
                OdorLevel: isToday ? (Number(latestStatus.OdorLevel ?? latestStatus.OdorSensVal) || 0) : 0,
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
