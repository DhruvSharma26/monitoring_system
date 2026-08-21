const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const mongoose = require("mongoose");
const Device = require("../models/Device");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const Alert = require("../models/Alert");
const Settings = require("../models/Settings");
const SensorData = require("../models/SensorData");
const ParticularRating = require("../models/ParticularRating");
const { calculateParticularRating } = require("../services/ratingService");

// Helper to get devices with admin scope
const getAdminDevices = async (adminId) => {
    if (adminId) {
        const queryConditions = [{ adminId: adminId }];
        if (mongoose.Types.ObjectId.isValid(adminId)) {
            queryConditions.push({ adminId: new mongoose.Types.ObjectId(adminId) });
        }
        return await Device.find({ $or: queryConditions }).sort({ createdAt: -1 }).lean();
    }
    return [];
};

const resolveDeviceStatuses = async (devices, adminId) => {
    if (!devices || devices.length === 0) return [];
    
    const LatestDeviceStatus = require("../models/LatestDeviceStatus");
    const Settings = require("../models/Settings");
    const Alert = require("../models/Alert");
    const { classifyTelemetry } = require("../services/alertClassifier");

    const [statuses, openAlerts, settings] = await Promise.all([
        LatestDeviceStatus.find().lean(),
        Alert.find({ status: { $in: ["OPEN", "ASSIGNED"] } }).lean(),
        Settings.findOne({ adminId }).lean()
    ]);

    const userSettings = settings || (await Settings.findOne().lean());

    const statusMap = {};
    (statuses || []).forEach(item => {
        if (item.device_uid) statusMap[item.device_uid.toLowerCase()] = item;
        if (item.deviceId) statusMap[item.deviceId.toLowerCase()] = item;
    });

    const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    return devices.map(device => {
        const devUids = [device.device_uid, device.deviceId, device._id ? device._id.toString() : null].filter(Boolean);
        let latestStatus = null;
        for (const u of devUids) {
            if (statusMap[u.toLowerCase()]) {
                latestStatus = statusMap[u.toLowerCase()];
                break;
            }
        }

        let toiletStatus = "Clean";
        if (latestStatus && (latestStatus.Counter !== undefined || latestStatus.OdorSensVal !== undefined || latestStatus.feedback !== undefined)) {
            const classification = classifyTelemetry(
                latestStatus.feedback,
                latestStatus.Counter ?? latestStatus.CounterValue,
                latestStatus.OdorSensVal ?? latestStatus.OdorLevel,
                userSettings
            );
            toiletStatus = classification.toiletStatus || "Clean";
        } else {
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
            }
        }

        return {
            ...device,
            status: toiletStatus,
            computedStatus: toiletStatus
        };
    });
};

// ----------------------------------------------------
// Dashboard Summary
// ----------------------------------------------------

const getDashboard = async (req, res) => {
    try {
        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const devices = await getAdminDevices(adminId);

        // Fetch live open alerts for devices
        const adminDeviceIds = devices.map(d => d._id).filter(Boolean);
        const adminDeviceUids = devices.flatMap(d => [d.device_uid, d.deviceId].filter(Boolean));
        const uidsRegex = adminDeviceUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

        let liveAlerts = [];
        if (adminDeviceUids.length > 0) {
            const deviceMap = {};
            devices.forEach(d => {
                if (d.device_uid) deviceMap[d.device_uid.toLowerCase()] = d;
                if (d.deviceId) deviceMap[d.deviceId.toLowerCase()] = d;
                if (d._id) deviceMap[d._id.toString().toLowerCase()] = d;
            });

            const rawAlerts = await Alert.find({
                $or: [
                    { device: { $in: adminDeviceIds } },
                    { device_uid: { $in: uidsRegex } },
                    { deviceId: { $in: uidsRegex } }
                ],
                status: { $in: ["OPEN", "ASSIGNED"] }
            }).sort({ createdAt: -1 }).limit(5).lean();

            liveAlerts = rawAlerts.map(a => formatAlertItem(a, deviceMap));
        }

        // Compute live dynamic status of devices using resolveDeviceStatuses (same logic as Toilet Screen)
        const devicesWithStatus = await resolveDeviceStatuses(devices, adminId);
        const totalToilets = devicesWithStatus.length;
        let clean = 0;
        let attention = 0;
        let critical = 0;

        devicesWithStatus.forEach(device => {
            const st = (device.computedStatus || 'Clean').toLowerCase().trim();
            if (st === 'critical') {
                critical++;
            } else if (st.includes('attention') || st === 'warning') {
                attention++;
            } else {
                clean++;
            }
        });

        const cleanPercent = totalToilets > 0 ? parseFloat(((clean / totalToilets) * 100).toFixed(1)) : 0.0;

        // Compute 24-hour unweighted average rating and total ratings count across devices
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        let totalRatings = 0;
        let sumParticularRatings = 0;

        if (adminDeviceUids.length > 0) {
            const particularRatings24h = await ParticularRating.find({
                $or: [
                    { device: { $in: adminDeviceIds } },
                    { device_uid: { $in: uidsRegex } }
                ],
                timestamp: { $gte: twentyFourHoursAgo }
            }).lean();

            totalRatings = particularRatings24h.length;
            sumParticularRatings = particularRatings24h.reduce((acc, r) => acc + (Number(r.particularRating) || 0), 0);

            // Fallback if legacy feedback logs exist in SensorData before ParticularRating table was populated
            if (totalRatings === 0) {
                const sensorLogs24h = await SensorData.find({
                    $or: [
                        { device_uid: { $in: uidsRegex } },
                        { deviceId: { $in: uidsRegex } }
                    ],
                    timestamp: { $gte: twentyFourHoursAgo },
                    feedback: { $exists: true, $ne: null }
                }).lean();

                const validLogs = sensorLogs24h.filter(l => Number(l.feedback) > 0);
                if (validLogs.length > 0) {
                    totalRatings = validLogs.length;
                    sumParticularRatings = validLogs.reduce((acc, l) => {
                        return acc + calculateParticularRating(l.Counter, l.OdorSensVal, l.feedback);
                    }, 0);
                }
            }
        }

        let averageRating = 0.0;
        if (totalRatings > 0) {
            averageRating = parseFloat((sumParticularRatings / totalRatings).toFixed(2));
        } else {
            // Fallback rating calculation if no 24-hour rating logs exist yet (scoped to admin's devices)
            if (adminDeviceUids.length > 0) {
                const recentRatings = await ParticularRating.find({
                    $or: [
                        { device: { $in: adminDeviceIds } },
                        { device_uid: { $in: uidsRegex } }
                    ]
                }).sort({ timestamp: -1 }).limit(50).lean();

                if (recentRatings.length > 0) {
                    totalRatings = recentRatings.length;
                    const sum = recentRatings.reduce((acc, r) => acc + (Number(r.particularRating) || 0), 0);
                    averageRating = parseFloat((sum / totalRatings).toFixed(2));
                } else if (totalToilets > 0) {
                    const statusScoreSum = (clean * 5.0) + (attention * 3.5) + (critical * 2.0);
                    averageRating = parseFloat((statusScoreSum / totalToilets).toFixed(1));
                } else {
                    averageRating = 0.0;
                }
            } else {
                averageRating = 0.0;
            }
        }

        // Query logs for 7-day usage and weekly ratings curves
        let sensorLogs7Days = [];
        if (adminDeviceUids.length > 0) {
            sensorLogs7Days = await SensorData.find({
                $or: [
                    { device_uid: { $in: uidsRegex } },
                    { deviceId: { $in: uidsRegex } }
                ],
                timestamp: { $gte: sevenDaysAgo }
            }).lean();
        }

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const usage_data = [];
        const weekly_ratings = [];

        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date();
            dayStart.setDate(now.getDate() - i);
            dayStart.setHours(0, 0, 0, 0);

            const dayEnd = new Date();
            dayEnd.setDate(now.getDate() - i);
            dayEnd.setHours(23, 59, 59, 999);

            const dayLabel = DAY_NAMES[dayStart.getDay()];
            const targetDateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`;

            const dayLogs = sensorLogs7Days.filter(log => {
                if (log.date) return log.date === targetDateStr;
                const logTime = new Date(log.timestamp).getTime();
                return logTime >= dayStart.getTime() && logTime <= dayEnd.getTime();
            });

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
                    const c = Number(log.Counter ?? log.counter ?? log.CounterValue ?? 0) || 0;
                    if (c > maxCounter) maxCounter = c;
                }
                if (maxCounter === 0 && devLogs.length > 0) {
                    maxCounter = devLogs.length;
                }
                deviceMap[device.device_uid || device._id] = maxCounter;
            }

            dayUsageTotal = Object.values(deviceMap).reduce((a, b) => a + b, 0);

            let dayRatingAvg = averageRating;
            if (dayLogs.length > 0) {
                const explicitFeedbackLogs = dayLogs.filter(l => l.feedback !== undefined && l.feedback !== null && Number(l.feedback) > 0);
                if (explicitFeedbackLogs.length > 0) {
                    const sum = explicitFeedbackLogs.reduce((acc, l) => acc + calculateParticularRating(l.Counter, l.OdorSensVal, l.feedback), 0);
                    dayRatingAvg = parseFloat((sum / explicitFeedbackLogs.length).toFixed(1));
                }
            }

            usage_data.push({ label: dayLabel, count: dayUsageTotal });
            weekly_ratings.push({ day: dayLabel, rating: dayRatingAvg });
        }

        return res.status(200).json({
            success: true,
            totalToilets,
            total_toilets: totalToilets,
            clean,
            cleanToilets: clean,
            clean_toilets: clean,
            needsAttention: attention,
            needs_attention: attention,
            attentionToilets: attention,
            needAttentionToilets: attention,
            critical,
            criticalToilets: critical,
            critical_toilets: critical,
            cleanPercent,
            clean_percent: cleanPercent,
            averageRating,
            average_rating: averageRating,
            totalFeedbacks: totalRatings,
            totalRatings,
            total_ratings: totalRatings,
            usageData: usage_data,
            usage_data: usage_data,
            weeklyRatings: weekly_ratings,
            weekly_ratings: weekly_ratings
        });
    } catch (error) {
        console.error("Error in getDashboard:", error);
        return res.status(500).json({
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
        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const devices = await getAdminDevices(adminId);

        const latestStatuses = await LatestDeviceStatus.find().lean();
        const statusMap = {};
        latestStatuses.forEach(item => {
            if (item.device_uid) statusMap[item.device_uid.toLowerCase()] = item;
            if (item.deviceId) statusMap[item.deviceId.toLowerCase()] = item;
        });

        const mapData = devices.map(device => {
            const devUids = [device.device_uid, device.deviceId, device._id ? device._id.toString() : null].filter(Boolean);
            let latest = null;
            for (const u of devUids) {
                if (statusMap[u.toLowerCase()]) {
                    latest = statusMap[u.toLowerCase()];
                    break;
                }
            }
            const status = (device.status || (latest ? latest.status : 'clean') || 'clean').toLowerCase();
            return {
                _id: device._id,
                deviceId: device.deviceId || device.device_uid,
                device_uid: device.device_uid,
                locationName: device.locationName || device.location || "Restroom",
                floor: device.floor || "1",
                latitude: device.latitude,
                longitude: device.longitude,
                status: status
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

const formatAlertItem = (alertDoc, deviceMap = {}) => {
    const alertItem = { ...alertDoc };
    const devKey = (alertItem.device_uid || alertItem.deviceId || (alertItem.device ? alertItem.device.toString() : '') || '').toLowerCase();
    const devInfo = deviceMap[devKey];

    if (devInfo) {
        alertItem.device = devInfo;
        alertItem.deviceId = devInfo.deviceId || alertItem.device_uid;
        alertItem.deviceLocation = `${devInfo.location || devInfo.locationName || ''}${devInfo.floor ? ' - Floor ' + devInfo.floor : ''}`;
    } else {
        alertItem.device = {
            _id: alertItem.device || null,
            device_uid: alertItem.device_uid || 'Device',
            deviceId: alertItem.deviceId || alertItem.device_uid || 'Device',
            location: alertItem.device_uid || 'Location',
            floor: ''
        };
        alertItem.deviceId = alertItem.device_uid || 'Device';
        alertItem.deviceLocation = alertItem.device_uid || 'Location';
    }

    const deviceStaff = devInfo ? devInfo.assignedStaff : null;
    if (alertItem.status === "EXPIRED" || alertItem.assignmentStatus === "EXPIRED") {
        alertItem.status = "EXPIRED";
        alertItem.assignmentStatus = "EXPIRED";
        alertItem.isExpired = true;
    } else if (deviceStaff) {
        alertItem.assignmentStatus = "ASSIGNED";
        alertItem.isAssigned = true;
        alertItem.staffId = deviceStaff._id ? deviceStaff._id.toString() : deviceStaff.toString();
        alertItem.assignedStaffName = deviceStaff.name || "";
        alertItem.assignedStaffEmpId = deviceStaff.empId || deviceStaff.userId || "";
    } else {
        alertItem.assignmentStatus = "NOT_ASSIGNED";
        alertItem.isAssigned = false;
        alertItem.staffId = null;
        alertItem.assignedStaffName = null;
        alertItem.assignedStaffEmpId = null;
    }

    const counterVal = alertItem.Counter ?? alertItem.CounterValue ?? alertItem.counterValue ?? alertItem.counterThreshold ?? alertItem.counter ?? 0;
    const odorVal = alertItem.OdorSensVal ?? alertItem.OdorLevel ?? alertItem.odorValue ?? alertItem.odorThreshold ?? alertItem.odor ?? 0;
    const feedbackVal = alertItem.feedback ?? alertItem.rating ?? alertItem.feedbackValue ?? 0;
    const descStr = alertItem.description || alertItem.adminRemarks || alertItem.alertType || 'Alert triggered';

    alertItem.id = alertItem._id;
    alertItem.alertId = alertItem._id;
    alertItem.counter = counterVal;
    alertItem.Counter = counterVal;
    alertItem.CounterValue = counterVal;
    alertItem.counterValue = counterVal;
    alertItem.odor = odorVal;
    alertItem.OdorSensVal = odorVal;
    alertItem.OdorLevel = odorVal;
    alertItem.odorValue = odorVal;
    alertItem.feedback = feedbackVal;
    alertItem.rating = feedbackVal;
    alertItem.feedbackValue = feedbackVal;
    alertItem.description = descStr;
    alertItem.message = descStr;
    alertItem.remarks = alertItem.adminRemarks || descStr;
    alertItem.location = alertItem.deviceLocation;
    alertItem.locationName = devInfo ? (devInfo.locationName || devInfo.location || '') : alertItem.deviceLocation;
    alertItem.floor = devInfo ? (devInfo.floor || '') : '';
    alertItem.alertCategory = alertItem.alertCategory || (alertItem.toiletStatus ? alertItem.toiletStatus : 'Need Attention');
    alertItem.alertType = alertItem.alertType || alertItem.alertCategory || 'NEEDS_ATTENTION';
    alertItem.category = alertItem.alertCategory;
    alertItem.type = alertItem.alertType;
    alertItem.originalStatus = alertItem.alertCategory;
    alertItem.expiredAlertType = alertItem.alertCategory;

    if (alertItem.status === "EXPIRED" || alertItem.assignmentStatus === "EXPIRED") {
        alertItem.status = "EXPIRED";
        alertItem.assignmentStatus = "EXPIRED";
        alertItem.isExpired = true;
        alertItem.adminRemarks = alertItem.adminRemarks || "";
        alertItem.remarks = alertItem.adminRemarks || `EXPIRED (${alertItem.alertCategory}): Alert from previous day was not resolved`;
    } else if (alertItem.status === "OPEN" || alertItem.assignmentStatus === "NOT_ASSIGNED") {
        alertItem.status = alertItem.alertType || alertItem.alertCategory || alertItem.status || "Critical";
        alertItem.adminRemarks = alertItem.adminRemarks || "";
        alertItem.remarks = alertItem.adminRemarks || alertItem.description || alertItem.alertType || 'Alert triggered';
    }

    const originalCreationTime = alertItem.createdAt || (alertItem._id && typeof alertItem._id.getTimestamp === 'function' ? alertItem._id.getTimestamp() : new Date());
    const latestTime = alertItem.updatedAt || alertItem.createdAt;
    alertItem.firstTriggeredAt = originalCreationTime;
    alertItem.triggeredAt = originalCreationTime;
    alertItem.createdAt = originalCreationTime;
    alertItem.updatedAt = alertItem.updatedAt || latestTime;
    alertItem.timestamp = latestTime;

    return alertItem;
};

// ----------------------------------------------------
// Live Alerts
// ----------------------------------------------------

const getLiveAlerts = async (req, res) => {
    try {
        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const devices = await getAdminDevices(adminId);

        const adminDeviceIds = devices.map(d => d._id).filter(Boolean);
        const adminDeviceUids = devices.flatMap(d => [d.device_uid, d.deviceId].filter(Boolean));
        const uidsRegex = adminDeviceUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

        let alerts = [];
        if (adminDeviceUids.length > 0) {
            const deviceMap = {};
            devices.forEach(d => {
                if (d.device_uid) deviceMap[d.device_uid.toLowerCase()] = d;
                if (d.deviceId) deviceMap[d.deviceId.toLowerCase()] = d;
                if (d._id) deviceMap[d._id.toString().toLowerCase()] = d;
            });

            const rawAlerts = await Alert.find({
                $or: [
                    { device: { $in: adminDeviceIds } },
                    { device_uid: { $in: uidsRegex } },
                    { deviceId: { $in: uidsRegex } }
                ],
                status: { $in: ["OPEN", "ASSIGNED"] }
            }).sort({ createdAt: -1 }).limit(10).lean();

            alerts = rawAlerts.map(a => formatAlertItem(a, deviceMap));
        }

        res.status(200).json({
            success: true,
            count: alerts.length,
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

const getAttentionCriticalToilets = async (req, res) => {
    try {
        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const rawDevices = await getAdminDevices(adminId);
        const devicesWithStatus = await resolveDeviceStatuses(rawDevices, adminId);

        const toilets = devicesWithStatus.filter(d => {
            const st = (d.computedStatus || 'Clean').toLowerCase().trim();
            return st === 'critical' || st.includes('attention') || st === 'warning';
        }).map(d => ({
            device_uid: d.device_uid,
            deviceId: d.deviceId,
            location: d.location || d.locationName,
            floor: d.floor,
            latitude: d.latitude,
            longitude: d.longitude,
            status: d.computedStatus
        }));

        res.status(200).json({
            success: true,
            count: toilets.length,
            toilets
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
// Toilet Rating Analysis & Comparison (Last 7 Days)
// ----------------------------------------------------

const getToiletRatingComparison = async (req, res) => {
    try {
        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const devices = await getAdminDevices(adminId);

        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const adminDeviceIds = devices.map(d => d._id).filter(Boolean);
        const adminDeviceUids = devices.flatMap(d => [d.device_uid, d.deviceId].filter(Boolean));
        const uidsRegex = adminDeviceUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

        let sensorLogs = [];
        let particularRatings = [];

        if (adminDeviceUids.length > 0) {
            [sensorLogs, particularRatings] = await Promise.all([
                SensorData.find({
                    $or: [
                        { device_uid: { $in: uidsRegex } },
                        { deviceId: { $in: uidsRegex } }
                    ],
                    timestamp: { $gte: sevenDaysAgo }
                }).lean(),
                ParticularRating.find({
                    $or: [
                        { device: { $in: adminDeviceIds } },
                        { device_uid: { $in: uidsRegex } }
                    ],
                    timestamp: { $gte: sevenDaysAgo }
                }).lean()
            ]);
        }

        const toiletData = devices.map((device) => {
            const devUids = [device.device_uid, device.deviceId, device._id ? device._id.toString() : null].filter(Boolean);
            
            const devRatings24h = particularRatings.filter(r => 
                new Date(r.timestamp).getTime() >= twentyFourHoursAgo.getTime() &&
                devUids.some(u => r.device_uid && r.device_uid.toLowerCase() === u.toLowerCase())
            );

            let avg24h = 0.0;
            let totRatings24h = devRatings24h.length;

            if (totRatings24h > 0) {
                const sum = devRatings24h.reduce((acc, r) => acc + (Number(r.particularRating) || 0), 0);
                avg24h = parseFloat((sum / totRatings24h).toFixed(2));
            } else {
                // Fallback to SensorData logs for this device over last 24h
                const devLogs24h = sensorLogs.filter(l => 
                    new Date(l.timestamp).getTime() >= twentyFourHoursAgo.getTime() &&
                    devUids.some(u => (l.device_uid && l.device_uid.toLowerCase() === u.toLowerCase()) || (l.deviceId && l.deviceId.toLowerCase() === u.toLowerCase()))
                );
                const feedbackLogs = devLogs24h.filter(l => l.feedback !== undefined && l.feedback !== null && Number(l.feedback) > 0);
                if (feedbackLogs.length > 0) {
                    totRatings24h = feedbackLogs.length;
                    const sum = feedbackLogs.reduce((acc, l) => acc + calculateParticularRating(l.Counter, l.OdorSensVal, l.feedback), 0);
                    avg24h = parseFloat((sum / totRatings24h).toFixed(2));
                } else {
                    // Default score based on device status
                    const st = (device.status || 'clean').toLowerCase();
                    avg24h = st === 'critical' ? 2.0 : (st === 'warning' || st === 'attention' ? 3.5 : 5.0);
                }
            }

            return {
                deviceId: device.deviceId || device.device_uid,
                device_uid: device.device_uid,
                location: device.location || device.locationName || "Restroom",
                floor: device.floor || "1",
                averageRating: avg24h,
                totalRatings: totRatings24h,
                status: (device.status || 'clean').toLowerCase()
            };
        });

        res.status(200).json({
            success: true,
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
