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
        const [devices, statuses, allSensorLogs, completedTasks, allStaff] = await Promise.all([
            Device.find({ adminId: req.user.id }).populate("assignedStaff", "name empId userId").sort({ createdAt: -1 }).lean(),
            LatestDeviceStatus.find().lean(),
            SensorData.find().sort({ timestamp: 1 }).lean(),
            Task.find({ status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] } })
                .populate("staff", "name empId userId")
                .sort({ updatedAt: -1 })
                .lean(),
            User.find({ role: "staff" }).select("name empId userId assignedDevice").lean()
        ]);

        const statusMap = {};
        statuses.forEach(item => {
            statusMap[item.device_uid] = item;
        });

        const toilets = [];

        for (const device of devices) {
            const latestStatus = statusMap[device.device_uid] || {};

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
            if (latestStatus.feedback === 3) {
                toiletStatus = "warning";
            } else if (latestStatus.feedback === 4) {
                toiletStatus = "critical";
            }

            if (
                status &&
                status.toLowerCase() !== "all" &&
                toiletStatus.toLowerCase() !== status.toLowerCase()
            ) {
                continue;
            }

            const devLogs = allSensorLogs.filter(log => log.device_uid === device.device_uid);

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

            let totalUsage = latestStatus.Counter || 0;
            if (devLogs.length > 0) {
                const maxSensorCounter = Math.max(...devLogs.map(l => l.Counter || 0));
                totalUsage = Math.max(totalUsage, maxSensorCounter);
            }

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
                Counter: latestStatus.Counter || 0,
                OdorSensVal: latestStatus.OdorSensVal || 0,
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