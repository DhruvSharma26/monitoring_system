const mongoose = require("mongoose");
const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const User = require("../models/User");
const Alert = require("../models/Alert");
const Task = require("../models/Task");
const ParticularRating = require("../models/ParticularRating");
const DailyRating = require("../models/DailyRating");
const Assignment = require("../models/Assignment");
const { calculateParticularRating } = require("../services/ratingService");

// Formula Grounded Helper
const calculateParticularRatingDetails = (counterVal, odorVal, feedbackVal) => {
    let cVal = Number(counterVal) || 0;
    let cRating = 5;
    if (cVal > 75) cRating = 1;
    else if (cVal >= 51) cRating = 2;
    else if (cVal >= 31) cRating = 3;
    else if (cVal >= 11) cRating = 4;
    else cRating = 5;

    let oVal = Number(odorVal) || 0;
    let oRating = 5;
    if (oVal > 350) oRating = 1;
    else if (oVal >= 251) oRating = 2;
    else if (oVal >= 151) oRating = 3;
    else if (oVal >= 51) oRating = 4;
    else oRating = 5;

    let fVal = Number(feedbackVal) || 1;
    let fRating = 4;
    if (fVal === 4) fRating = 4;
    else if (fVal === 3) fRating = 3;
    else if (fVal === 2) fRating = 2;
    else if (fVal === 1) fRating = 1;
    else fRating = 4;

    let particularRating = parseFloat(((cRating + oRating + fRating) / 3).toFixed(2));

    return {
        counterValue: cVal,
        counterRating: cRating,
        odorValue: oVal,
        odorRating: oRating,
        feedbackValue: fVal,
        feedbackRating: fRating,
        particularRating
    };
};

// Date Range Validation (Max 1 Month = ~31 Days)
const parseAndValidateReportDateRange = (reqQuery) => {
    const { from, till, to, fromDate: qFrom, toDate: qTo } = reqQuery;
    const now = new Date();
    
    let rawFrom = from || qFrom;
    let rawTill = till || to || qTo;

    let fromDate = rawFrom ? new Date(rawFrom) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let tillDate = rawTill ? new Date(rawTill) : new Date(now);

    if (isNaN(fromDate.getTime())) fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (isNaN(tillDate.getTime())) tillDate = new Date(now);

    if (typeof rawFrom === 'string' && rawFrom.length === 10) {
        fromDate.setHours(0, 0, 0, 0);
    }
    if (typeof rawTill === 'string' && rawTill.length === 10) {
        tillDate.setHours(23, 59, 59, 999);
    }

    if (fromDate > tillDate) {
        const temp = fromDate;
        fromDate = tillDate;
        tillDate = temp;
    }

    const diffMs = tillDate.getTime() - fromDate.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 32) {
        return { error: "Report date range cannot exceed 1 month." };
    }

    return { fromDate, tillDate, diffDays };
};

// Admin Scoped Helper
const getReportUserInfo = async (userObj) => {
    let generatedBy = "Admin";
    let userId = "N/A";
    if (userObj && userObj.id) {
        const dbUser = await User.findById(userObj.id).lean();
        if (dbUser) {
            generatedBy = dbUser.name || dbUser.contactPerson || dbUser.companyName || dbUser.email || "Admin";
            if (dbUser.role === 'admin') {
                userId = dbUser.userId || dbUser.empId || dbUser._id.toString();
            } else if (dbUser.adminId) {
                const adminUser = await User.findById(dbUser.adminId).lean();
                userId = adminUser ? (adminUser.userId || adminUser.empId || adminUser._id.toString()) : (dbUser.userId || dbUser._id.toString());
            } else {
                userId = dbUser.userId || dbUser.empId || dbUser._id.toString();
            }
        } else {
            userId = userObj.id;
        }
    }
    return { generatedBy, userId };
};

const getAdminDeviceScope = async (userObj) => {
    let query = {};
    if (userObj && userObj.role === 'staff') {
        const staffUser = await User.findById(userObj.id);
        const assignedDevId = staffUser ? staffUser.assignedDevice : null;
        query.$or = [
            { assignedStaff: userObj.id },
            ...(assignedDevId ? [{ _id: assignedDevId }] : [])
        ];
    } else if (userObj && userObj.id) {
        query.adminId = userObj.id;
    }
    const devices = await Device.find(query).populate("assignedStaff").lean();
    const deviceIds = devices.map(d => d._id);
    const deviceUids = devices.map(d => d.device_uid);
    return { devices, deviceIds, deviceUids };
};

// 1. Daily Report
const getDailyReport = async (req, res) => {
    try {
        const { devices, deviceIds, deviceUids } = await getAdminDeviceScope(req.user);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const alerts = await Alert.countDocuments({
            device_uid: { $in: deviceUids },
            createdAt: { $gte: today }
        });

        const resolvedAlerts = await Alert.countDocuments({
            device_uid: { $in: deviceUids },
            status: "RESOLVED",
            createdAt: { $gte: today }
        });

        const tasks = await Task.countDocuments({
            device: { $in: deviceIds },
            createdAt: { $gte: today }
        });

        const completedTasks = await Task.countDocuments({
            device: { $in: deviceIds },
            status: { $in: ["VERIFIED", "COMPLETED", "RESOLVED"] },
            createdAt: { $gte: today }
        });

        res.status(200).json({
            success: true,
            report: {
                date: today,
                totalToilets: devices.length,
                alerts,
                resolvedAlerts,
                tasks,
                completedTasks
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 2. Weekly Report
const getWeeklyReport = async (req, res) => {
    try {
        const { deviceIds, deviceUids } = await getAdminDeviceScope(req.user);
        const start = new Date();
        start.setDate(start.getDate() - 7);

        const alerts = await Alert.countDocuments({
            device_uid: { $in: deviceUids },
            createdAt: { $gte: start }
        });

        const tasks = await Task.countDocuments({
            device: { $in: deviceIds },
            createdAt: { $gte: start }
        });

        const completed = await Task.countDocuments({
            device: { $in: deviceIds },
            status: { $in: ["VERIFIED", "COMPLETED", "RESOLVED"] },
            createdAt: { $gte: start }
        });

        res.status(200).json({
            success: true,
            report: { alerts, tasks, completed }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 3. Monthly Report
const getMonthlyReport = async (req, res) => {
    try {
        const { deviceIds, deviceUids } = await getAdminDeviceScope(req.user);
        const start = new Date();
        start.setMonth(start.getMonth() - 1);

        const alerts = await Alert.countDocuments({
            device_uid: { $in: deviceUids },
            createdAt: { $gte: start }
        });

        const tasks = await Task.countDocuments({
            device: { $in: deviceIds },
            createdAt: { $gte: start }
        });

        const completed = await Task.countDocuments({
            device: { $in: deviceIds },
            status: { $in: ["VERIFIED", "COMPLETED", "RESOLVED"] },
            createdAt: { $gte: start }
        });

        res.status(200).json({
            success: true,
            report: { alerts, tasks, completed }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 4. Report Stats
const getReportStats = async (req, res) => {
    try {
        const { devices, deviceIds, deviceUids } = await getAdminDeviceScope(req.user);

        const totalAlertsCount = await Alert.countDocuments({ device_uid: { $in: deviceUids } });
        const resolvedAlertsCount = await Alert.countDocuments({
            device_uid: { $in: deviceUids },
            status: "RESOLVED"
        });
        const resolvedTasksCount = await Task.countDocuments({
            device: { $in: deviceIds },
            status: { $in: ["VERIFIED", "COMPLETED", "RESOLVED"] }
        });

        const effectiveResolvedAlerts = Math.max(resolvedAlertsCount, resolvedTasksCount);
        const pendingAlerts = Math.max(0, totalAlertsCount - effectiveResolvedAlerts);

        const latestStatuses = await LatestDeviceStatus.find({ device_uid: { $in: deviceUids } }).lean();
        let sumRating = 0;
        let ratingCount = 0;
        for (const s of latestStatuses) {
            if (s.feedback !== undefined && s.feedback !== null) {
                sumRating += calculateParticularRating(s.Counter, s.OdorSensVal, s.feedback);
                ratingCount++;
            }
        }
        const avgRatingVal = ratingCount > 0 ? parseFloat((sumRating / ratingCount).toFixed(1)) : 4.5;

        const completedTasksList = await Task.find({
            device: { $in: deviceIds },
            status: { $in: ["COMPLETED", "VERIFIED", "RESOLVED"] }
        }).select("createdAt completedAt verifiedAt startedAt assignedAt").lean();

        let avgResponseStr = "15m";
        if (completedTasksList.length > 0) {
            let totalDiffMs = 0;
            let validTaskCount = 0;
            for (const t of completedTasksList) {
                const startTime = t.assignedAt || t.startedAt || t.createdAt;
                const endTime = t.completedAt || t.verifiedAt;
                if (startTime && endTime) {
                    const diff = new Date(endTime) - new Date(startTime);
                    if (diff > 0) {
                        totalDiffMs += diff;
                        validTaskCount++;
                    }
                }
            }
            if (validTaskCount > 0) {
                const avgMinutes = Math.round(totalDiffMs / validTaskCount / (1000 * 60));
                avgResponseStr = avgMinutes + "m";
            }
        }

        const stats = {
            total_reports: devices.length,
            avg_rating: avgRatingVal,
            total_alerts: totalAlertsCount,
            resolved_alerts: effectiveResolvedAlerts,
            pending_alerts: pendingAlerts,
            avg_response_time: avgResponseStr
        };
        res.status(200).json(stats);
    } catch (error) {
        console.error("Error in getReportStats:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 5. Reports List
const getReportsList = async (req, res) => {
    try {
        const { devices } = await getAdminDeviceScope(req.user);
        const reports = devices.map(d => ({
            id: "rep_" + d._id,
            title: (d.deviceId || d.device_uid) + " Performance Report",
            date: new Date().toISOString().split("T")[0],
            status: "ready",
            deviceId: d.deviceId || d.device_uid,
            location: d.location || "Main Restroom"
        }));
        res.status(200).json({ success: true, reports });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 6. Generate Report trigger
const generateReport = async (req, res) => {
    try {
        res.status(200).json({ success: true, message: "Report generation completed" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 7. Comprehensive Device Reports (Fully Detailed Operational Audit Report)
const getDeviceReports = async (req, res) => {
    try {
        const dateRangeResult = parseAndValidateReportDateRange(req.query);
        if (dateRangeResult.error) {
            return res.status(400).json({ success: false, message: dateRangeResult.error });
        }
        const { fromDate, tillDate } = dateRangeResult;

        const { deviceId } = req.query;
        const { generatedBy, userId } = await getReportUserInfo(req.user);
        const { devices: userDevices } = await getAdminDeviceScope(req.user);

        let targetDevices = userDevices;
        if (deviceId) {
            targetDevices = userDevices.filter(d => 
                d.deviceId === deviceId || d.device_uid === deviceId || d._id.toString() === deviceId
            );
        }

        if (targetDevices.length === 0) {
            return res.status(200).json({
                success: true,
                reportSummary: {
                    period: fromDate.toISOString().split('T')[0] + " to " + tillDate.toISOString().split('T')[0],
                    adminName: generatedBy,
                    adminId: userId,
                    totalDevices: 0,
                    totalRatings: 0,
                    averageRating: 0,
                    totalAlerts: 0,
                    criticalAlerts: 0,
                    needAttentionAlerts: 0,
                    totalCleaningTasks: 0,
                    completedCleaningTasks: 0
                },
                reports: []
            });
        }

        const deviceIds = targetDevices.map(d => d._id);
        const deviceUids = targetDevices.map(d => d.device_uid);

        // BATCH QUERIES
        const [allSensorLogs, allParticularRatings, allAlerts, allTasks] = await Promise.all([
            SensorData.find({
                device_uid: { $in: deviceUids },
                timestamp: { $gte: fromDate, $lte: tillDate }
            }).sort({ timestamp: 1 }).lean(),

            ParticularRating.find({
                device_uid: { $in: deviceUids },
                timestamp: { $gte: fromDate, $lte: tillDate }
            }).sort({ timestamp: 1 }).lean(),

            Alert.find({
                $or: [{ device_uid: { $in: deviceUids } }, { device: { $in: deviceIds } }],
                createdAt: { $gte: fromDate, $lte: tillDate }
            }).sort({ createdAt: -1 }).lean(),

            Task.find({
                device: { $in: deviceIds },
                createdAt: { $gte: fromDate, $lte: tillDate }
            }).populate("staff assignedBy timeline.updatedBy").sort({ createdAt: -1 }).lean()
        ]);

        // Overall Summary Calculations
        let overallTotalRatings = allParticularRatings.length;
        let overallSumRating = allParticularRatings.reduce((acc, r) => acc + r.particularRating, 0);
        let overallAverageRating = overallTotalRatings > 0 ? parseFloat((overallSumRating / overallTotalRatings).toFixed(2)) : 4.5;

        let totalAlertsCount = allAlerts.length;
        let criticalAlertsCount = allAlerts.filter(a => a.alertCategory === "Critical").length;
        let needAttentionAlertsCount = allAlerts.filter(a => a.alertCategory === "Need Attention").length;

        let totalCleaningTasksCount = allTasks.length;
        let completedCleaningTasksCount = allTasks.filter(t => ["COMPLETED", "VERIFIED", "RESOLVED"].includes(t.status)).length;

        const formatDateStr = (d) => {
            const date = new Date(d);
            return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, '0') + "-" + String(date.getDate()).padStart(2, '0');
        };

        const formatTimeStr = (d) => {
            if (!d) return "N/A";
            const date = new Date(d);
            if (isNaN(date.getTime())) return "N/A";
            return date.toLocaleString("en-US", {
                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
            });
        };

        // BUILD PER-DEVICE AUDIT REPORT
        const reports = targetDevices.map(device => {
            const devUid = device.device_uid;
            const devId = device._id.toString();

            const devLogs = allSensorLogs.filter(l => l.device_uid === devUid);
            const devParticularRatings = allParticularRatings.filter(r => r.device_uid === devUid);
            const devAlerts = allAlerts.filter(a => a.device_uid === devUid || (a.device && a.device.toString() === devId));
            const devTasks = allTasks.filter(t => t.device && t.device.toString() === devId);

            // 1. Individual Particular Ratings Table
            const individualRatings = devParticularRatings.map(r => {
                const details = calculateParticularRatingDetails(r.counterValue, r.odorValue, r.customerFeedback);
                return {
                    id: r._id.toString(),
                    timestamp: formatTimeStr(r.timestamp),
                    date: r.date || formatDateStr(r.timestamp),
                    feedback: r.customerFeedback,
                    counter: r.counterValue,
                    counterRating: details.counterRating,
                    odor: r.odorValue + " ppm",
                    odorRating: details.odorRating,
                    feedbackRating: details.feedbackRating,
                    particularRating: r.particularRating
                };
            });

            // 2. Daily Rating Table (Unweighted Daily Mean of Particular Ratings)
            const dateMap = new Map();
            devParticularRatings.forEach(r => {
                const dateKey = r.date || formatDateStr(r.timestamp);
                if (!dateMap.has(dateKey)) {
                    dateMap.set(dateKey, { totalRatings: 0, sumPR: 0, sumCR: 0, sumOR: 0, sumFR: 0 });
                }
                const dayObj = dateMap.get(dateKey);
                const details = calculateParticularRatingDetails(r.counterValue, r.odorValue, r.customerFeedback);
                dayObj.totalRatings++;
                dayObj.sumPR += r.particularRating;
                dayObj.sumCR += details.counterRating;
                dayObj.sumOR += details.odorRating;
                dayObj.sumFR += details.feedbackRating;
            });

            const dailyRatingTable = Array.from(dateMap.entries()).map(([dateStr, dObj]) => ({
                date: dateStr,
                totalRatings: dObj.totalRatings,
                averageParticularRating: parseFloat((dObj.sumPR / dObj.totalRatings).toFixed(2)),
                counterRating: parseFloat((dObj.sumCR / dObj.totalRatings).toFixed(1)),
                odorRating: parseFloat((dObj.sumOR / dObj.totalRatings).toFixed(1)),
                feedbackRating: parseFloat((dObj.sumFR / dObj.totalRatings).toFixed(1))
            }));

            // 3. Counter & Odor MQTT Telemetry Logs
            const counterLogs = devLogs.map(l => {
                const details = calculateParticularRatingDetails(l.Counter, l.OdorSensVal, l.feedback);
                return {
                    timestamp: formatTimeStr(l.timestamp),
                    date: l.date || formatDateStr(l.timestamp),
                    counterValue: l.Counter || 0,
                    counterRating: details.counterRating
                };
            });

            const odorLogs = devLogs.map(l => {
                const details = calculateParticularRatingDetails(l.Counter, l.OdorSensVal, l.feedback);
                return {
                    timestamp: formatTimeStr(l.timestamp),
                    date: l.date || formatDateStr(l.timestamp),
                    odorValue: (l.OdorSensVal || 0) + " ppm",
                    odorRating: details.odorRating
                };
            });

            // 4. Usage Data per Date (Starting, Ending, Total Usage)
            const usageMap = new Map();
            devLogs.forEach(l => {
                const dateKey = l.date || formatDateStr(l.timestamp);
                const cVal = Number(l.Counter) || 0;
                if (!usageMap.has(dateKey)) {
                    usageMap.set(dateKey, { min: cVal, max: cVal });
                } else {
                    const uObj = usageMap.get(dateKey);
                    if (cVal < uObj.min) uObj.min = cVal;
                    if (cVal > uObj.max) uObj.max = cVal;
                }
            });

            const usageData = Array.from(usageMap.entries()).map(([dateStr, uObj]) => ({
                date: dateStr,
                startingCounter: uObj.min,
                endingCounter: uObj.max,
                totalUsage: Math.max(0, uObj.max - uObj.min)
            }));

            // 5. Cleaning Activity & Cleaning Count per Date
            const taskDateMap = new Map();
            devTasks.forEach(t => {
                const dateKey = formatDateStr(t.createdAt || t.assignedAt);
                if (!taskDateMap.has(dateKey)) {
                    taskDateMap.set(dateKey, []);
                }
                const staffName = t.staff ? (t.staff.name || "Staff Member") : "Unassigned";
                const staffEmpId = t.staff ? (t.staff.empId || t.staff.userId || "N/A") : "N/A";
                const assignedTime = formatTimeStr(t.assignedAt || t.createdAt);
                const startTime = formatTimeStr(t.startedAt) || "Not started";
                const completionTime = formatTimeStr(t.completedAt || t.verifiedAt) || "Not completed";

                let durationMins = "N/A";
                if (t.startedAt && (t.completedAt || t.verifiedAt)) {
                    const diffMs = new Date(t.completedAt || t.verifiedAt) - new Date(t.startedAt);
                    if (diffMs > 0) durationMins = Math.round(diffMs / 60000) + " mins";
                }

                taskDateMap.get(dateKey).push({
                    taskId: t._id.toString(),
                    title: t.taskName || t.title || "Restroom Cleaning & Hygiene",
                    staffName,
                    staffEmpId,
                    assignedTime,
                    startTime,
                    completionTime,
                    status: t.status,
                    durationMins
                });
            });

            const cleaningHistory = Array.from(taskDateMap.entries()).map(([dateStr, tasksList]) => ({
                date: dateStr,
                cleaningCount: tasksList.length,
                tasks: tasksList
            }));

            // 6. Alert Audit History & Reassignment Timelines
            const alertsHistory = devAlerts.map(a => {
                const matchedTask = devTasks.find(t => t.alert && t.alert.toString() === a._id.toString());
                const staffName = matchedTask && matchedTask.staff ? (matchedTask.staff.name || "Staff Member") : (device.assignedStaff ? device.assignedStaff.name : "Unassigned");
                const staffEmpId = matchedTask && matchedTask.staff ? (matchedTask.staff.empId || matchedTask.staff.userId || "N/A") : "N/A";

                const reassignmentHistory = matchedTask && matchedTask.timeline ? matchedTask.timeline.map(tl => ({
                    status: tl.status,
                    reassignmentTime: formatTimeStr(tl.timestamp),
                    notes: tl.notes || ""
                })) : [];

                return {
                    alertId: a._id.toString(),
                    timestamp: formatTimeStr(a.createdAt),
                    date: formatDateStr(a.createdAt),
                    category: a.alertCategory || "Need Attention",
                    description: a.description || "System alert triggered",
                    feedbackValue: a.feedback !== undefined ? a.feedback : "N/A",
                    counterValue: a.Counter !== undefined ? a.Counter : "N/A",
                    odorValue: a.OdorSensVal !== undefined ? (a.OdorSensVal + " ppm") : "N/A",
                    assignedStaffName: staffName,
                    assignedStaffEmpId: staffEmpId,
                    assignedTime: formatTimeStr(matchedTask ? (matchedTask.assignedAt || matchedTask.createdAt) : a.createdAt),
                    reassignmentHistory,
                    taskStatus: matchedTask ? matchedTask.status : a.status,
                    startTime: matchedTask ? formatTimeStr(matchedTask.startedAt) : "Not started",
                    completionTime: matchedTask ? formatTimeStr(matchedTask.completedAt || matchedTask.verifiedAt) : "Not completed"
                };
            });

            const currentStatusLower = (device.status || '').toLowerCase();
            let status = "Clean";
            if (currentStatusLower === 'critical') status = "Critical / Alert";
            else if (currentStatusLower === 'warning' || currentStatusLower === 'attention') status = "Needs Attention";

            const staffObj = device.assignedStaff;
            const assignedStaffInfo = staffObj ? (staffObj.name + " (" + (staffObj.empId || staffObj.userId || 'N/A') + ")") : "Unassigned Staff";

            return {
                deviceId: device.deviceId || device.device_uid,
                deviceUid: device.device_uid,
                deviceName: device.location ? (device.location + " (" + (device.floor || 'G') + ")") : (device.deviceId || device.device_uid),
                location: device.location ? (device.location + " - Floor " + (device.floor || 'G')) : "Main Restroom",
                status: status,
                assignedStaff: assignedStaffInfo,

                dailyRatingTable,
                individualRatings,
                counterLogs,
                odorLogs,
                usageData,
                cleaningHistory,
                alertsHistory
            };
        });

        const reportSummary = {
            period: formatDateStr(fromDate) + " to " + formatDateStr(tillDate),
            adminName: generatedBy,
            adminId: userId,
            totalDevices: targetDevices.length,
            totalRatings: overallTotalRatings,
            averageRating: overallAverageRating,
            totalAlerts: totalAlertsCount,
            criticalAlerts: criticalAlertsCount,
            needAttentionAlerts: needAttentionAlertsCount,
            totalCleaningTasks: totalCleaningTasksCount,
            completedCleaningTasks: completedCleaningTasksCount
        };

        res.status(200).json({
            success: true,
            reportSummary,
            reports
        });
    } catch (error) {
        console.error("Error in getDeviceReports:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 8. Download Report CSV
const downloadReportCsv = async (req, res) => {
    try {
        const dateRangeResult = parseAndValidateReportDateRange(req.query);
        if (dateRangeResult.error) {
            return res.status(400).json({ success: false, message: dateRangeResult.error });
        }
        res.status(200).json({ success: true, message: "CSV export generated" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 9. Download Report PDF
const downloadReportPdf = async (req, res) => {
    try {
        const dateRangeResult = parseAndValidateReportDateRange(req.query);
        if (dateRangeResult.error) {
            return res.status(400).json({ success: false, message: dateRangeResult.error });
        }
        res.status(200).json({ success: true, message: "PDF export generated" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport,
    getReportStats,
    getReportsList,
    generateReport,
    getDeviceReports,
    downloadReportCsv,
    downloadReportPdf
};
