const Device = require("../models/Device");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const SensorData = require("../models/SensorData");
const Task = require("../models/Task");

const feedbackToRating = (fb) => {
    if (fb === 1 || fb === 2) return 5.0;
    if (fb === 3) return 2.5;
    if (fb === 4) return 1.0;
    return 4.5;
};

const getToilets = async (req, res) => {
    try {
        const { status } = req.query;

        const User = require("../models/User");
        let adminDevices = await Device.find({ adminId: req.user.id }).populate("assignedStaff", "name empId userId").sort({ createdAt: -1 }).lean();
        if (!adminDevices || adminDevices.length === 0) {
            adminDevices = await Device.find().populate("assignedStaff", "name empId userId").sort({ createdAt: -1 }).lean();
        }
        const devices = adminDevices;

        const Settings = require("../models/Settings");
        const [statuses, allSensorLogs, completedTasks, allStaff, settings] = await Promise.all([
            LatestDeviceStatus.find().lean(),
            SensorData.find().sort({ timestamp: 1 }).lean(),
            Task.find({ status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] } })
                .populate("staff", "name empId userId")
                .sort({ updatedAt: -1 })
                .lean(),
            User.find({ role: "staff" }).select("name empId userId assignedDevice").lean(),
            Settings.findOne({ adminId: req.user.id }).lean()
        ]);

        const userSettings = settings || (await Settings.findOne().lean());
        const odorThreshold = userSettings?.odorThreshold || 80;
        const counterThreshold = userSettings?.counterThreshold || 100;
        const warningOdorThreshold = Math.round(odorThreshold * 0.625);
        const warningCounterThreshold = Math.round(counterThreshold * 0.7);

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

            let assignedStaffName = "";
            let assignedStaffUserId = "";
            let assignedStaffEmpId = "";

            if (device.assignedStaff) {
                assignedStaffName = device.assignedStaff.name || "";
                assignedStaffUserId = device.assignedStaff.userId || "";
                assignedStaffEmpId = device.assignedStaff.empId || "";
            } else {
                const assignedUser = allStaff.find(s => String(s.assignedDevice) === String(device._id));
                if (assignedUser) {
                    assignedStaffName = assignedUser.name || "";
                    assignedStaffUserId = assignedUser.userId || "";
                    assignedStaffEmpId = assignedUser.empId || "";
                }
            }

            let toiletStatus = "clean";
            const odor = Number(latestStatus.OdorSensVal) || 0;
            const counter = Number(latestStatus.Counter) || 0;

            if (latestStatus.feedback === 3 || odor >= warningOdorThreshold || counter >= warningCounterThreshold) {
                toiletStatus = "warning";
            }
            if (latestStatus.feedback === 4 || odor >= odorThreshold || counter >= counterThreshold) {
                toiletStatus = "critical";
            }

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

            const devLogs = allSensorLogs.filter(log => devUids.some(u =>
                (log.device_uid && log.device_uid.toLowerCase() === u.toLowerCase()) ||
                (log.deviceId && log.deviceId.toLowerCase() === u.toLowerCase())
            ));

            let averageRating = 5.0;
            if (devLogs.length > 0) {
                const logsWithFeedback = devLogs.filter(l => l.feedback !== undefined && l.feedback !== null);
                if (logsWithFeedback.length > 0) {
                    const sum = logsWithFeedback.reduce((acc, l) => acc + feedbackToRating(l.feedback), 0);
                    averageRating = parseFloat((sum / logsWithFeedback.length).toFixed(1));
                } else if (latestStatus.feedback !== undefined) {
                    averageRating = feedbackToRating(latestStatus.feedback);
                }
            } else if (latestStatus.feedback !== undefined) {
                averageRating = feedbackToRating(latestStatus.feedback);
            }

            let counterVal = Number(latestStatus.Counter) || 0;
            let odorVal = Number(latestStatus.OdorSensVal) || 0;

            if (devLogs.length > 0) {
                const maxSensorCounter = Math.max(...devLogs.map(l => Number(l.Counter) || 0));
                if (maxSensorCounter > counterVal) counterVal = maxSensorCounter;

                const maxSensorOdor = Math.max(...devLogs.map(l => Number(l.OdorSensVal) || 0));
                if (maxSensorOdor > odorVal) odorVal = maxSensorOdor;
            }

            let totalUsage = counterVal;

            const deviceTask = completedTasks.find(t => String(t.device) === String(device._id));
            let lastCleanedAt = "";
            let lastCleanedByStaffName = "";
            let lastCleanedByStaffUserId = "";
            let lastCleanedByStaffEmpId = "";

            if (deviceTask) {
                const cleanedDate = deviceTask.verifiedAt || deviceTask.completedAt || deviceTask.submittedAt || deviceTask.updatedAt;
                if (cleanedDate) {
                    lastCleanedAt = new Date(cleanedDate).toLocaleString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    });
                }
                if (deviceTask.staff) {
                    lastCleanedByStaffName = deviceTask.staff.name || "";
                    lastCleanedByStaffUserId = deviceTask.staff.userId || "";
                    lastCleanedByStaffEmpId = deviceTask.staff.empId || "";
                }
            } else if (latestStatus && latestStatus.timestamp) {
                lastCleanedAt = new Date(latestStatus.timestamp).toLocaleString("en-US", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });
            }

            toilets.push({
                deviceId: device.deviceId || device.device_uid,
                device_uid: device.device_uid,
                location: device.location,
                floor: device.floor,
                status: toiletStatus,
                rating: averageRating,
                averageRating: averageRating,
                usageToday: totalUsage,
                totalUsage: totalUsage,
                feedback: latestStatus.feedback || 0,
                Counter: counterVal,
                OdorSensVal: odorVal,
                latitude: device.latitude,
                longitude: device.longitude,
                timestamp: latestStatus.timestamp || device.createdAt,
                assignedStaffName: assignedStaffName,
                assignedStaffUserId: assignedStaffUserId,
                assignedStaffEmpId: assignedStaffEmpId,
                lastCleanedAt: lastCleanedAt,
                lastCleanedByStaffName: lastCleanedByStaffName,
                lastCleanedByStaffUserId: lastCleanedByStaffUserId,
                lastCleanedByStaffEmpId: lastCleanedByStaffEmpId
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