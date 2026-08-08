const Device = require("../models/Device");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const Alert = require("../models/Alert");
const Settings = require("../models/Settings");
const SensorData = require("../models/SensorData");

// ----------------------------------------------------
// Dashboard Summary
// ----------------------------------------------------

const getDashboard = async (req, res) => {
    try {

        let devices = await Device.find({ adminId: req.user.id }).sort({ createdAt: -1 }).lean();
        if (!devices || devices.length === 0) {
            devices = await Device.find().sort({ createdAt: -1 }).lean();
        }

        const [statuses, liveAlerts] =
            await Promise.all([
                LatestDeviceStatus.find().lean(),
                Alert.find({ status: "OPEN" }).sort({ createdAt: -1 }).limit(5).lean()
            ]);

        const totalToilets = devices.length;

        let clean = 0;
        let attention = 0;
        let critical = 0;
        let totalRating = 0;

        const statusMap = {};
        statuses.forEach(item => {
            statusMap[item.device_uid] = item;
        });

        devices.forEach(device => {
            const item = statusMap[device.device_uid];

            if (!item || item.feedback === 1 || item.feedback === 2) {
                clean++;
                totalRating += 5;
            } else if (item.feedback === 3) {
                attention++;
                totalRating += 2;
            } else if (item.feedback === 4) {
                critical++;
                totalRating += 1;
            } else {
                clean++;
                totalRating += 5;
            }
        });

        const averageRating =
            devices.length > 0
                ? (
                    totalRating /
                    devices.length
                ).toFixed(1)
                : 0;

        // Compute real dynamic usage_data and weekly_ratings from last 7 days sensor logs
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const allUids = devices.flatMap(d => [d.device_uid, d.deviceId, d._id ? d._id.toString() : null].filter(Boolean));
        const uidsRegex = allUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

        const sensorLogs = await SensorData.find({
            $or: [
                { device_uid: { $in: uidsRegex } },
                { deviceId: { $in: uidsRegex } }
            ],
            timestamp: { $gte: sevenDaysAgo }
        }).lean();

        const feedbackToRating = (fb) => {
            if (fb === 1 || fb === 2) return 5.0;
            if (fb === 3) return 2.5;
            if (fb === 4) return 1.0;
            return 5.0;
        };

        const usage_data = [];
        const weekly_ratings = [];

        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date();
            dayStart.setDate(now.getDate() - i);
            dayStart.setHours(0, 0, 0, 0);

            const dayEnd = new Date();
            dayEnd.setDate(now.getDate() - i);
            dayEnd.setHours(23, 59, 59, 999);

            const dayLabel = dayNames[dayStart.getDay()];

            const dayLogs = sensorLogs.filter(log => {
                const logTime = new Date(log.timestamp).getTime();
                return logTime >= dayStart.getTime() && logTime <= dayEnd.getTime();
            });

            // Daily usage count across all toilets
            let dayUsageTotal = 0;
            const deviceMap = {};

            for (const device of devices) {
                const devUids = [device.device_uid, device.deviceId, device._id ? device._id.toString() : null].filter(Boolean);
                const devLogs = dayLogs.filter(l => devUids.some(u => 
                    (l.device_uid && l.device_uid.toLowerCase() === u.toLowerCase()) || 
                    (l.deviceId && l.deviceId.toLowerCase() === u.toLowerCase())
                ));
                let maxCounter = 0;
                for (const log of devLogs) {
                    const c = Number(log.Counter) || 0;
                    if (c > maxCounter) maxCounter = c;
                }
                if (maxCounter === 0 && i === 0) {
                    const st = statusMap[device.device_uid] || statusMap[device.deviceId];
                    if (st && st.Counter) {
                        maxCounter = Number(st.Counter) || 0;
                    }
                }
                deviceMap[device.device_uid || device._id] = maxCounter;
            }

            dayUsageTotal = Object.values(deviceMap).reduce((a, b) => a + b, 0);

            // Daily average rating across all toilets
            let dayRatingAvg = 5.0;
            if (dayLogs.length > 0) {
                const explicitFeedbackLogs = dayLogs.filter(l => l.feedback !== undefined && l.feedback !== null && Number(l.feedback) > 0);
                if (explicitFeedbackLogs.length > 0) {
                    const sum = explicitFeedbackLogs.reduce((acc, l) => acc + feedbackToRating(Number(l.feedback)), 0);
                    dayRatingAvg = parseFloat((sum / explicitFeedbackLogs.length).toFixed(1));
                } else {
                    const highOdorLogs = dayLogs.filter(l => (Number(l.OdorSensVal) || 0) >= 80);
                    dayRatingAvg = highOdorLogs.length > 0 ? 1.0 : 5.0;
                }
            }

            usage_data.push({ label: dayLabel, count: dayUsageTotal });
            weekly_ratings.push({ day: dayLabel, rating: dayRatingAvg });
        }

        const total_feedbacks = sensorLogs.length;

        res.status(200).json({
            success: true,
            dashboard: {
                totalToilets,
                cleanToilets: clean,
                attentionToilets: attention,
                criticalToilets: critical,
                averageRating,
                total_feedbacks,
                usage_data,
                weekly_ratings,
                liveAlerts
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

// ----------------------------------------------------
// Map Data
// ----------------------------------------------------

const getMapData = async (req, res) => {

    try {

        const [devices, statuses] =
            await Promise.all([

                Device.find({ adminId: req.user.id }).sort({ createdAt: -1 }).lean(),

                LatestDeviceStatus
                    .find()
                    .lean()

            ]);

        const statusMap = {};

        statuses.forEach(status => {

            statusMap[
                status.device_uid
            ] = status;

        });

        const mapData =
            devices.map(device => {

                const statusData =
                    statusMap[
                        device.device_uid
                    ];

                let status = "clean";

                if (statusData) {

                    switch (
                        statusData.feedback
                    ) {

                        case 1:
                        case 2:
                            status = "clean";
                            break;

                        case 3:
                            status = "attention";
                            break;

                        case 4:
                            status = "critical";
                            break;

                    }

                }

                return {

                    device_uid:
                        device.device_uid,

                    deviceId:
                        device.deviceId,

                    location:
                        device.location,

                    latitude:
                        device.latitude,

                    longitude:
                        device.longitude,

                    status

                };

            });

        res.status(200).json({
            success: true,
            data: mapData
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

// ----------------------------------------------------
// Live Alerts
// ----------------------------------------------------

const getLiveAlerts = async (req, res) => {

    try {

        const settings =
            await Settings.findOne({
                adminId:
                    req.user.id
            }).lean();

        const counterThreshold =
            settings?.counterThreshold || 100;

        const odorThreshold =
            settings?.odorThreshold || 80;

        const [devices, statuses] =
            await Promise.all([

                Device.find({ adminId: req.user.id }).sort({ createdAt: -1 }).lean(),

                LatestDeviceStatus
                    .find()
                    .lean()

            ]);

        const statusMap = {};

        statuses.forEach(status => {

            statusMap[
                status.device_uid
            ] = status;

        });

        const alerts = [];

        for (const device of devices) {

            const status =
                statusMap[
                    device.device_uid
                ];

            if (!status)
                continue;

            let alertType = null;

            if (
                status.feedback === 4
            ) {

                alertType =
                    "CRITICAL_FEEDBACK";

            }

            else if (
                status.feedback === 3
            ) {

                alertType =
                    "WARNING_FEEDBACK";

            }

            else if (
                (status.Counter || 0) >
                counterThreshold
            ) {

                alertType =
                    "HIGH_USAGE";

            }

            else if (
                (status.OdorSensVal || 0) >
                odorThreshold
            ) {

                alertType =
                    "HIGH_ODOR";

            }

            if (alertType) {

                alerts.push({

                    device_uid:
                        device.device_uid,

                    deviceId:
                        device.deviceId,

                    location:
                        device.location,

                    alertType,

                    feedback:
                        status.feedback,

                    Counter:
                        status.Counter,

                    OdorSensVal:
                        status.OdorSensVal,

                    timestamp:
                        status.timestamp

                });

            }

        }

        res.status(200).json({

            success: true,

            count:
                alerts.length,

            alerts

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

// ----------------------------------------------------
// Attention / Critical Toilets
// ----------------------------------------------------

const getAttentionCriticalToilets =
    async (req, res) => {

        try {

            const [devices, statuses] =
                await Promise.all([

                    Device.find({ adminId: req.user.id }).lean(),

                    LatestDeviceStatus
                        .find()
                        .lean()

                ]);

            const statusMap = {};

            statuses.forEach(status => {

                statusMap[
                    status.device_uid
                ] = status;

            });

            const toilets = [];

            for (const device of devices) {

                const status =
                    statusMap[
                        device.device_uid
                    ];

                if (!status)
                    continue;

                if (
                    status.feedback === 3 ||
                    status.feedback === 4
                ) {

                    toilets.push({

                        device_uid:
                            device.device_uid,

                        deviceId:
                            device.deviceId,

                        location:
                            device.location,

                        floor:
                            device.floor,

                        latitude:
                            device.latitude,

                        longitude:
                            device.longitude,

                        feedback:
                            status.feedback,

                        status:
                            status.feedback === 3
                                ? "ATTENTION"
                                : "CRITICAL",

                        Counter:
                            status.Counter,

                        OdorSensVal:
                            status.OdorSensVal,

                        timestamp:
                            status.timestamp

                    });

                }

            }

            res.status(200).json({

                success: true,

                count:
                    toilets.length,

                toilets

            });

        } catch (error) {

        }

    };

// ----------------------------------------------------
// Toilet Rating Analysis & Comparison (Last 7 Days)
// ----------------------------------------------------

const getToiletRatingComparison = async (req, res) => {
    try {
        let devices = await Device.find({ adminId: req.user.id }).sort({ createdAt: -1 }).lean();
        if (!devices || devices.length === 0) {
            devices = await Device.find().sort({ createdAt: -1 }).lean();
        }

        const statuses = await LatestDeviceStatus.find().lean();
        const statusMap = {};
        statuses.forEach(item => {
            statusMap[item.device_uid] = item;
        });

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const allUids = devices.flatMap(d => [d.device_uid, d.deviceId].filter(Boolean));
        const sensorLogs = await SensorData.find({
            device_uid: { $in: allUids },
            timestamp: { $gte: sevenDaysAgo }
        }).lean();

        const feedbackToRating = (fb) => {
            if (fb === 1 || fb === 2) return 5.0;
            if (fb === 3) return 2.5;
            if (fb === 4) return 1.0;
            return 5.0;
        };

        const toiletData = devices.map((device, index) => {
            const devLogs = sensorLogs.filter(log => log.device_uid === device.device_uid || log.device_uid === device.deviceId);
            const statusObj = statusMap[device.device_uid] || statusMap[device.deviceId];

            const dailyRatings = [];
            let sumRating = 0;
            let ratingCount = 0;

            for (let i = 6; i >= 0; i--) {
                const dayStart = new Date();
                dayStart.setDate(now.getDate() - i);
                dayStart.setHours(0, 0, 0, 0);

                const dayEnd = new Date();
                dayEnd.setDate(now.getDate() - i);
                dayEnd.setHours(23, 59, 59, 999);

                const dateStr = dayStart.toISOString().split("T")[0];
                const dayLabel = dayNames[dayStart.getDay()];

                const dayLogs = devLogs.filter(log => {
                    const logTime = new Date(log.timestamp).getTime();
                    return logTime >= dayStart.getTime() && logTime <= dayEnd.getTime();
                });

                let dayRating = 0.0;
                if (dayLogs.length > 0) {
                    const explicitLogs = dayLogs.filter(l => l.feedback !== undefined && l.feedback !== null && Number(l.feedback) > 0);
                    if (explicitLogs.length > 0) {
                        const daySum = explicitLogs.reduce((acc, log) => acc + feedbackToRating(Number(log.feedback)), 0);
                        dayRating = parseFloat((daySum / explicitLogs.length).toFixed(1));
                    } else {
                        const highOdor = dayLogs.some(l => (Number(l.OdorSensVal) || 0) >= 80);
                        const warningOdor = dayLogs.some(l => (Number(l.OdorSensVal) || 0) >= 50);
                        dayRating = highOdor ? 1.0 : (warningOdor ? 2.5 : 5.0);
                    }
                    sumRating += dayRating;
                    ratingCount++;
                }

                dailyRatings.push({
                    day: dayLabel,
                    date: dateStr,
                    rating: dayRating
                });
            }

            const avgRating = ratingCount > 0 ? parseFloat((sumRating / ratingCount).toFixed(1)) : 5.0;

            let status = "clean";
            if (statusObj) {
                if (statusObj.feedback === 3 || statusObj.OdorSensVal >= 50) status = "attention";
                if (statusObj.feedback === 4 || statusObj.OdorSensVal >= 80) status = "critical";
            }

            return {
                device_uid: device.device_uid,
                deviceId: device.deviceId || device.device_uid,
                location: device.location || "Unknown Location",
                averageRating: avgRating,
                totalFeedbacks: devLogs.length,
                status,
                dailyRatings
            };
        });

        const cityAverage = toiletData.length > 0
            ? parseFloat((toiletData.reduce((acc, t) => acc + t.averageRating, 0) / toiletData.length).toFixed(1))
            : 0;

        res.status(200).json({
            success: true,
            period: "Last 7 Days",
            cityAverage,
            toilets: toiletData
        });
    } catch (error) {
        console.error("Error in getToiletRatingComparison:", error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

module.exports = {
    getDashboard,
    getMapData,
    getLiveAlerts,
    getAttentionCriticalToilets,
    getToiletRatingComparison
};