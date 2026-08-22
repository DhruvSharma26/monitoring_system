const mongoose = require("mongoose");
const Alert = require("../models/Alert");
const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const User = require("../models/User");
const Task = require("../models/Task");

const getObjectCreationTime = (obj) => {
    if (!obj) return 0;
    if (obj.createdAt) return new Date(obj.createdAt).getTime();
    if (obj.assignedAt) return new Date(obj.assignedAt).getTime();
    if (obj.timestamp) return new Date(obj.timestamp).getTime();
    
    const id = obj._id || obj.id;
    if (id) {
        if (typeof id.getTimestamp === 'function') {
            return id.getTimestamp().getTime();
        }
        const idStr = id.toString();
        if (idStr.length === 24) {
            return parseInt(idStr.substring(0, 8), 16) * 1000;
        }
    }
    return 0;
};

const getAlerts = async (req, res) => {
    try {
        const { type, status, tab } = req.query;

        let categoryConditions = [];
        if (type && type.toLowerCase() === "critical") {
            categoryConditions = [{ alertCategory: "Critical" }, { alertType: "CRITICAL" }, { toiletStatus: "CRITICAL" }, { toiletStatus: "Critical" }];
        } else if (type && (type.toLowerCase() === "attention" || type.toLowerCase() === "needs_attention" || type.toLowerCase() === "need_attention")) {
            categoryConditions = [{ alertCategory: "Need Attention" }, { alertType: "NEEDS_ATTENTION" }, { toiletStatus: "NEEDS_ATTENTION" }, { toiletStatus: "Need Attention" }];
        }

        let query = {};
        let myDevices = [];
        let staffUserObj = null;

        if (req.user && req.user.role === 'staff') {
            staffUserObj = await User.findById(req.user.id);
            if (!staffUserObj) {
                return res.status(200).json({ success: true, count: 0, alerts: [] });
            }

            const assignedDevId = staffUserObj.assignedDevice;
            const devConditions = [
                { assignedStaff: staffUserObj._id }
            ];
            if (assignedDevId) {
                devConditions.push({ _id: assignedDevId });
                devConditions.push({ device_uid: assignedDevId });
                devConditions.push({ deviceId: assignedDevId });
            }

            const staffTasks = await Task.find({ staff: staffUserObj._id }).select("device device_uid deviceId").lean();
            staffTasks.forEach(t => {
                if (t.device) devConditions.push({ _id: t.device });
                if (t.device_uid) devConditions.push({ device_uid: t.device_uid });
                if (t.deviceId) devConditions.push({ deviceId: t.deviceId });
            });

            myDevices = await Device.find({ $or: devConditions })
                .populate("assignedStaff", "name empId userId email")
                .select("_id device_uid deviceId location floor locationName assignedStaff")
                .lean();
        } else {
            // ADMIN ROLE: Fetch all devices across system
            myDevices = await Device.find({})
                .populate("assignedStaff", "name empId userId email")
                .select("_id device_uid deviceId location floor locationName assignedStaff adminId")
                .lean();
        }

        const alertConditions = [];
        myDevices.forEach(d => {
            if (d._id) alertConditions.push({ device: d._id });
            if (d.device_uid) alertConditions.push({ device_uid: d.device_uid });
            if (d.deviceId) alertConditions.push({ deviceId: d.deviceId });
        });

        if (alertConditions.length > 0) {
            if (categoryConditions.length > 0) {
                query = { $and: [{ $or: alertConditions }, { $or: categoryConditions }] };
            } else {
                query = { $or: alertConditions };
            }
        } else {
            return res.status(200).json({ success: true, count: 0, alerts: [], data: [] });
        }

        const deviceMap = {};
        myDevices.forEach(d => {
            if (d.device_uid) deviceMap[d.device_uid.toLowerCase()] = d;
            if (d.deviceId) deviceMap[d.deviceId.toLowerCase()] = d;
            if (d._id) deviceMap[d._id.toString().toLowerCase()] = d;
        });

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        let alerts = await Alert.find(query).sort({ createdAt: -1 }).lean();

        // Bulk fetch all tasks with device and staff populated
        const allTasks = await Task.find()
            .populate("staff", "name empId userId email")
            .populate("device", "device_uid deviceId location floor locationName assignedStaff")
            .sort({ createdAt: -1 })
            .lean();
        
        // Map tasks by alert ID
        const taskByAlertIdMap = new Map();
        allTasks.forEach(t => {
            if (t.alert) taskByAlertIdMap.set(t.alert.toString(), t);
        });

        const mergedAlerts = [];
        const processedTaskIds = new Set();

        // 1. Process all existing Alert collection records
        for (let i = 0; i < alerts.length; i++) {
            const alertItem = { ...alerts[i] };
            const alertIdStr = alertItem._id ? alertItem._id.toString() : '';
            const devKey = (alertItem.device_uid || alertItem.deviceId || (alertItem.device ? alertItem.device.toString() : '') || '').toLowerCase();
            const devInfo = deviceMap[devKey];

            // STRICT MATCHING BY ALERT ID OR TASK ID ONLY
            let task = taskByAlertIdMap.get(alertIdStr);
            if (!task && alertItem.taskId) {
                const taskIdStr = alertItem.taskId.toString();
                task = allTasks.find(t => t._id.toString() === taskIdStr);
            }

            if (task) {
                processedTaskIds.add(task._id.toString());
                alertItem.taskId = task._id;
                alertItem.taskStatus = task.status;
                alertItem.adminRemarks = task.adminRemarks || alertItem.adminRemarks || task.notes || alertItem.notes || "";
            alertItem.reassignNotes = alertItem.reassignNotes || (task ? task.notes : null) || alertItem.adminRemarks || "";
                alertItem.taskProgressPercent = (task.status === "VERIFIED" || task.status === "RESOLVED") ? 100 : (task.progressPercent || 0);

                if (task.status === "VERIFIED" || task.status === "RESOLVED") {
                    alertItem.status = "VERIFIED";
                } else if (task.status === "REJECTED") {
                    alertItem.status = "REJECTED";
                }

                let photos = [];
                if (Array.isArray(task.cleaningPhotos) && task.cleaningPhotos.length > 0) {
                    photos = task.cleaningPhotos.map(p => typeof p === "string" ? p : (p.url || p.path || ""));
                }
                if (photos.length === 0) {
                    if (task.beforeCleaningPhoto) photos.push(task.beforeCleaningPhoto);
                    if (task.afterCleaningPhoto) photos.push(task.afterCleaningPhoto);
                }
                alertItem.taskCleaningPhotos = photos.filter(Boolean);

                alertItem.resolvedAt = task.resolvedAt || task.verifiedAt || alertItem.resolvedAt;
                alertItem.assignedAt = task.assignedAt;
                const reassignStep = Array.isArray(task.timeline) ? task.timeline.find(step => step.status === "REASSIGNED") : null;
                if (reassignStep) {
                    alertItem.reassignedAt = reassignStep.timestamp;
                    alertItem.reassignNotes = reassignStep.notes || task.notes || "";
                }
                alertItem.startedAt = task.startedAt;
                alertItem.photosUploadedAt = task.photosUploadedAt;
                alertItem.submittedAt = task.submittedAt;
                alertItem.completedAt = task.completedAt;
                alertItem.verifiedAt = task.verifiedAt;
                if (task.staff) {
                    alertItem.staffId = task.staff._id ? task.staff._id.toString() : task.staff.toString();
                    alertItem.assignedStaffName = task.staff.name;
                    alertItem.assignedStaffEmpId = task.staff.empId || task.staff.userId || "";
                }
            } else if (!alertItem.taskCleaningPhotos) {
                alertItem.taskCleaningPhotos = [];
            }

            // STRICT ASSIGNMENT: AN ALERT IS ONLY ASSIGNED IF IT HAS AN ACTIVE TASK LINKED TO IT
            const taskStaff = task ? task.staff : null;
            if (task && taskStaff) {
                alertItem.assignmentStatus = "ASSIGNED";
                alertItem.isAssigned = true;
                alertItem.staffId = taskStaff._id ? taskStaff._id.toString() : taskStaff.toString();
                alertItem.assignedStaffName = taskStaff.name || alertItem.assignedStaffName || "";
                alertItem.assignedStaffEmpId = taskStaff.empId || taskStaff.userId || alertItem.assignedStaffEmpId || "";

                alertItem.taskId = task._id.toString();
                alertItem.taskStatus = task.status || "ASSIGNED";
                alertItem.taskProgressPercent = (task.status === "VERIFIED" || task.status === "RESOLVED") ? 100 : (task.status === "REJECTED" ? 0 : (task.status === "SUBMITTED" ? 90 : (task.status === "IN_PROGRESS" ? 50 : (task.progressPercent || 25))));
                let taskPhotos = Array.isArray(task.cleaningPhotos) ? task.cleaningPhotos.map(p => typeof p === 'string' ? p : (p.url || p.path || '')) : []; if (taskPhotos.length === 0) { if (task.beforeCleaningPhoto) taskPhotos.push(task.beforeCleaningPhoto); if (task.afterCleaningPhoto) taskPhotos.push(task.afterCleaningPhoto); } alertItem.taskCleaningPhotos = taskPhotos.filter(Boolean);
                alertItem.startedAt = task.startedAt || alertItem.startedAt;
                alertItem.photosUploadedAt = task.photosUploadedAt || alertItem.photosUploadedAt;
                alertItem.submittedAt = task.submittedAt || alertItem.submittedAt;
                alertItem.completedAt = task.completedAt || alertItem.completedAt;
                alertItem.assignedAt = task.assignedAt || alertItem.assignedAt;
                alertItem.reassignedAt = task.reassignedAt || alertItem.reassignedAt || null;
                alertItem.reassignNotes = task.notes || alertItem.reassignNotes || "";
                alertItem.adminRemarks = task.adminRemarks || alertItem.adminRemarks || "";
                alertItem.reassignedStaffName = alertItem.assignedStaffName || "";

                if (task.status === "EXPIRED" || alertItem.status === "EXPIRED" || alertItem.assignmentStatus === "EXPIRED") {
                    alertItem.status = "EXPIRED";
                    alertItem.assignmentStatus = "EXPIRED";
                    alertItem.isExpired = true;
                } else if (task.status === "REJECTED") {
                    alertItem.status = "REJECTED";
                } else if (task.status === "ASSIGNED" || task.status === "IN_PROGRESS" || task.status === "SUBMITTED" || alertItem.status === "OPEN" || alertItem.status === "UNASSIGNED") {
                    alertItem.status = "ASSIGNED";
                }
            } else {
                alertItem.assignmentStatus = "NOT_ASSIGNED";
                alertItem.isAssigned = false;
                alertItem.staffId = null;
                alertItem.assignedStaffName = null;
                alertItem.assignedStaffEmpId = null;
                if (alertItem.status !== "VERIFIED" && alertItem.status !== "RESOLVED" && alertItem.status !== "COMPLETED" && alertItem.status !== "EXPIRED") {
                    alertItem.status = "OPEN";
                }
            }

            // Exclude verified/resolved alerts older than 30 days
            if (alertItem.status === "VERIFIED" || alertItem.status === "RESOLVED") {
                const resolvedDate = alertItem.resolvedAt || alertItem.verifiedAt || alertItem.completedAt || alertItem.updatedAt;
                if (resolvedDate && new Date(resolvedDate) < thirtyDaysAgo) {
                    continue;
                }
            }

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

            // Populate telemetry fields
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
            alertItem.expiredAlertType = alertItem.alertCategory;

            const originalCreationTime = alertItem.createdAt || (alertItem._id && typeof alertItem._id.getTimestamp === 'function' ? alertItem._id.getTimestamp() : new Date());
            const latestTime = alertItem.updatedAt || alertItem.createdAt;
            alertItem.firstTriggeredAt = originalCreationTime;
            alertItem.triggeredAt = originalCreationTime;
            alertItem.createdAt = originalCreationTime;
            alertItem.updatedAt = alertItem.updatedAt || latestTime;
            alertItem.timestamp = latestTime;

            if (alertItem.staffId) {
                const staffObj = {
                    _id: alertItem.staffId,
                    name: alertItem.assignedStaffName || '',
                    empId: alertItem.assignedStaffEmpId || '',
                    userId: alertItem.assignedStaffEmpId || ''
                };
                alertItem.staff = staffObj;
                alertItem.assignedStaff = staffObj;
            } else {
                alertItem.staff = null;
                alertItem.assignedStaff = null;
            }

            mergedAlerts.push(alertItem);
        }

        // 2. Process synthetic alerts from Tasks without Alert record
        for (let i = 0; i < allTasks.length; i++) {
            const task = allTasks[i];
            const taskIdStr = task._id.toString();
            if (processedTaskIds.has(taskIdStr)) continue;

            const devKey = (task.device_uid || task.deviceId || (task.device ? (task.device.device_uid || task.device.deviceId) : '') || '').toLowerCase();
            const devInfo = deviceMap[devKey];

            const taskItem = {
                _id: task.alert ? task.alert.toString() : `task_${task._id}`,
                id: task.alert ? task.alert.toString() : `task_${task._id}`,
                taskId: task._id.toString(),
                taskStatus: task.status,
                adminRemarks: task.adminRemarks || "",
                taskProgressPercent: (task.status === "VERIFIED" || task.status === "RESOLVED") ? 100 : (task.progressPercent || 0),
                status: (task.status === "VERIFIED" || task.status === "RESOLVED") ? "VERIFIED" : (task.status === "REJECTED" ? "REJECTED" : "ASSIGNED"),
                assignmentStatus: "ASSIGNED",
                isAssigned: true,
                title: task.title || (devInfo ? `Task for ${devInfo.locationName || devInfo.location || devInfo.device_uid}` : 'Assigned Task'),
                description: task.description || task.notes || 'Task assigned to staff',
                createdAt: task.createdAt || task.assignedAt || new Date(),
                assignedAt: task.assignedAt,
                startedAt: task.startedAt,
                photosUploadedAt: task.photosUploadedAt,
                submittedAt: task.submittedAt,
                completedAt: task.completedAt,
                verifiedAt: task.verifiedAt,
                updatedAt: task.updatedAt || task.createdAt,
                assignedStaffName: task.staff ? task.staff.name : '',
                assignedStaffEmpId: task.staff ? (task.staff.empId || task.staff.userId || '') : '',
                taskCleaningPhotos: (Array.isArray(task.cleaningPhotos) ? task.cleaningPhotos.map(p => typeof p === 'string' ? p : (p.url || p.path || '')) : []).filter(Boolean)
            };

            if (devInfo) {
                taskItem.device = devInfo;
                taskItem.deviceId = devInfo.deviceId || devInfo.device_uid;
                taskItem.location = `${devInfo.location || devInfo.locationName || ''}${devInfo.floor ? ' - Floor ' + devInfo.floor : ''}`;
            }

            mergedAlerts.push(taskItem);
        }

        // Sort descending by activity timestamp
        mergedAlerts.sort((a, b) => getObjectCreationTime(b) - getObjectCreationTime(a));

        return res.status(200).json({
            success: true,
            count: mergedAlerts.length,
            alerts: mergedAlerts,
            data: mergedAlerts
        });
    } catch (error) {
        console.error("Error fetching alerts:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

module.exports = {
    getAlerts,
    getAlertDetails: async (req, res) => { res.status(200).json({ success: true }); },
    resolveAlert: async (req, res) => {
        try {
            const alertId = req.params.alertId || req.params.id || req.body.alertId || req.body.id;
            const Alert = require("../models/Alert");
            const Task = require("../models/Task");
            const Device = require("../models/Device");
            const LatestDeviceStatus = require("../models/LatestDeviceStatus");

            const alert = await Alert.findById(alertId);
            if (!alert) {
                return res.status(404).json({ success: false, message: "Alert not found" });
            }

            const now = new Date();
            alert.status = "VERIFIED";
            alert.resolvedAt = now;
            alert.adminRemarks = req.body.remarks || "Resolved & verified clean by admin";
            alert.updatedAt = now;
            await alert.save();

            // Also verify any linked Task
            let task = null;
            if (alert.taskId) {
                task = await Task.findById(alert.taskId);
            }
            if (!task) {
                task = await Task.findOne({ alert: alert._id });
            }

            if (task) {
                task.status = "VERIFIED";
                task.verifiedAt = now;
                task.completedAt = task.completedAt || now;
                task.resolvedAt = task.resolvedAt || now;
                task.progressPercent = 100;
                task.timeline.push({
                    status: "VERIFIED",
                    timestamp: now,
                    updatedBy: req.user ? req.user.id : null,
                    notes: "Verified clean by admin via alert resolution"
                });
                await task.save();
            }

            // Check device and remaining open alerts
            let dev = null;
            if (alert.device) {
                dev = await Device.findById(alert.device);
            }
            if (!dev && alert.deviceId) {
                dev = await Device.findOne({ $or: [{ deviceId: alert.deviceId }, { device_uid: alert.deviceId }] });
            }

            let isClean = false;
            if (dev) {
                const remainingOpenAlerts = await Alert.countDocuments({
                    $or: [
                        { device: dev._id },
                        { deviceId: dev.deviceId },
                        { device_uid: dev.device_uid }
                    ],
                    status: { $in: ["OPEN", "ASSIGNED"] }
                });

                if (remainingOpenAlerts === 0) {
                    isClean = true;
                    await Device.findByIdAndUpdate(dev._id, { status: "clean" });
                    await LatestDeviceStatus.findOneAndUpdate(
                        { $or: [{ device_uid: dev.device_uid }, { deviceId: dev.deviceId }] },
                        {
                            $set: {
                                feedback: 4,
                                Counter: 0,
                                CounterValue: 0,
                                OdorSensVal: 0,
                                OdorLevel: 0,
                                status: "clean",
                                timestamp: now
                            }
                        },
                        { upsert: true }
                    );

                    if (global.io) {
                        const cleanPayload = {
                            device_uid: dev.device_uid,
                            deviceId: dev.deviceId,
                            status: "clean",
                            toiletStatus: "Clean",
                            feedback: 4,
                            Counter: 0,
                            CounterValue: 0,
                            OdorSensVal: 0,
                            OdorLevel: 0,
                            timestamp: now
                        };
                        global.io.emit("device_status_update", cleanPayload);
                        global.io.emit("toilet_status_updated", cleanPayload);
                    }
                }
            }

            if (global.io) {
                global.io.emit("new_alert", { alertId: alert._id, status: "VERIFIED" });
                if (task) {
                    global.io.emit("task_status_updated", { taskId: task._id, alertId: alert._id, status: "VERIFIED", progressPercent: 100 });
                }
            }

            try {
                const notificationService = require("../services/notificationService");
                await notificationService.markNotificationsReadForAlert(alert._id);
            } catch (err) {
                console.log("Error marking notifications read:", err.message);
            }

            return res.status(200).json({
                success: true,
                message: isClean ? "Alert Verified & Restroom Marked Clean" : "Alert Verified",
                alert,
                task,
                isClean
            });
        } catch (error) {
            console.error("Error in resolveAlert:", error);
            return res.status(500).json({ success: false, message: "Server error", error: error.message });
        }
    },
    forceVerifyAlert: async (req, res) => {
        try {
            const alertId = req.params.alertId || req.params.id || req.body.alertId || req.body.id;
            const Alert = require("../models/Alert");
            const Task = require("../models/Task");
            const Device = require("../models/Device");
            const LatestDeviceStatus = require("../models/LatestDeviceStatus");

            const alert = await Alert.findById(alertId);
            if (!alert) {
                return res.status(404).json({ success: false, message: "Alert not found" });
            }

            const now = new Date();
            alert.status = "VERIFIED";
            alert.resolvedAt = now;
            alert.adminRemarks = req.body.remarks || "Force verified clean by admin";
            alert.updatedAt = now;
            await alert.save();

            // Also verify any linked Task
            let task = null;
            if (alert.taskId) {
                task = await Task.findById(alert.taskId);
            }
            if (!task) {
                task = await Task.findOne({ alert: alert._id });
            }

            if (task) {
                task.status = "VERIFIED";
                task.verifiedAt = now;
                task.completedAt = task.completedAt || now;
                task.resolvedAt = task.resolvedAt || now;
                task.progressPercent = 100;
                task.timeline.push({
                    status: "VERIFIED",
                    timestamp: now,
                    updatedBy: req.user ? req.user.id : null,
                    notes: "Force verified clean by admin"
                });
                await task.save();
            }

            // Check device and remaining open alerts
            let dev = null;
            if (alert.device) {
                dev = await Device.findById(alert.device);
            }
            if (!dev && alert.deviceId) {
                dev = await Device.findOne({ $or: [{ deviceId: alert.deviceId }, { device_uid: alert.deviceId }] });
            }

            let isClean = false;
            if (dev) {
                const remainingOpenAlerts = await Alert.countDocuments({
                    $or: [
                        { device: dev._id },
                        { deviceId: dev.deviceId },
                        { device_uid: dev.device_uid }
                    ],
                    status: { $in: ["OPEN", "ASSIGNED"] }
                });

                if (remainingOpenAlerts === 0) {
                    isClean = true;
                    await Device.findByIdAndUpdate(dev._id, { status: "clean" });
                    await LatestDeviceStatus.findOneAndUpdate(
                        { $or: [{ device_uid: dev.device_uid }, { deviceId: dev.deviceId }] },
                        {
                            $set: {
                                feedback: 4,
                                Counter: 0,
                                CounterValue: 0,
                                OdorSensVal: 0,
                                OdorLevel: 0,
                                status: "clean",
                                timestamp: now
                            }
                        },
                        { upsert: true }
                    );

                    if (global.io) {
                        const cleanPayload = {
                            device_uid: dev.device_uid,
                            deviceId: dev.deviceId,
                            status: "clean",
                            toiletStatus: "Clean",
                            feedback: 4,
                            Counter: 0,
                            CounterValue: 0,
                            OdorSensVal: 0,
                            OdorLevel: 0,
                            timestamp: now
                        };
                        global.io.emit("device_status_update", cleanPayload);
                        global.io.emit("toilet_status_updated", cleanPayload);
                    }
                }
            }

            if (global.io) {
                global.io.emit("new_alert", { alertId: alert._id, status: "VERIFIED" });
                if (task) {
                    global.io.emit("task_status_updated", { taskId: task._id, alertId: alert._id, status: "VERIFIED", progressPercent: 100 });
                }
            }

            try {
                const notificationService = require("../services/notificationService");
                await notificationService.markNotificationsReadForAlert(alert._id);
            } catch (err) {
                console.log("Error marking notifications read:", err.message);
            }

            return res.status(200).json({
                success: true,
                message: isClean ? "Alert Force Verified & Restroom Marked Clean" : "Alert Force Verified",
                alert,
                task,
                isClean
            });
        } catch (error) {
            console.error("Error in forceVerifyAlert:", error);
            return res.status(500).json({ success: false, message: "Server error", error: error.message });
        }
    },
    assignAlert: async (req, res) => {
        try {
            const alertId = req.params.alertId || req.body.alertId || req.body.id;
            const staffId = req.body.staff_id || req.body.staffId;
            const taskName = req.body.taskName || req.body.title;
            const notes = req.body.notes || req.body.remarks || taskName || "";

            if (!alertId || !staffId) {
                return res.status(400).json({ success: false, message: "Alert ID and Staff ID are required" });
            }

            const Alert = require("../models/Alert");
            const Task = require("../models/Task");
            const User = require("../models/User");
            const Device = require("../models/Device");

            const alert = await Alert.findById(alertId);
            if (!alert) {
                return res.status(404).json({ success: false, message: "Alert not found" });
            }

            const isObjectId = mongoose.Types.ObjectId.isValid(staffId);
            let staff = isObjectId ? await User.findOne({ _id: staffId, role: "staff" }) : null;
            if (!staff) {
                staff = await User.findOne({ $or: [{ userId: staffId }, { email: staffId }], role: "staff" });
            }

            if (!staff) {
                return res.status(404).json({ success: false, message: "Staff member not found" });
            }

            const now = new Date();
            const prevStaffId = alert.assignedStaff ? alert.assignedStaff.toString() : (alert.staffId ? alert.staffId.toString() : null);
            const isReassign = Boolean(prevStaffId || alert.status === "REJECTED" || alert.status === "ASSIGNED" || alert.taskId);

            // Find or create device
            let device = null;
            if (alert.device && mongoose.Types.ObjectId.isValid(alert.device)) {
                device = await Device.findById(alert.device);
            }
            if (!device && alert.deviceId) {
                device = await Device.findOne({ $or: [{ deviceId: alert.deviceId }, { device_uid: alert.deviceId }] });
            }
            if (!device && alert.device_uid) {
                device = await Device.findOne({ $or: [{ device_uid: alert.device_uid }, { deviceId: alert.device_uid }] });
            }

            // Find or create Task linked to Alert
            let task = null;
            if (alert.taskId && mongoose.Types.ObjectId.isValid(alert.taskId)) {
                task = await Task.findById(alert.taskId);
            }
            if (!task) {
                task = await Task.findOne({ alert: alert._id });
            }

            if (task) {
                task.staff = staff._id;
                task.status = "ASSIGNED";
                task.progressPercent = 0;
                task.assignedAt = now;
                if (isReassign) task.reassignedAt = now;
                task.assignedBy = req.user ? req.user.id : null;
                if (notes) {
                    task.notes = notes;
                    task.adminRemarks = notes;
                }
                task.startedAt = null;
                task.submittedAt = null;
                task.photosUploadedAt = null;
                task.verifiedAt = null;
                task.completedAt = null;
                task.resolvedAt = null;
                task.beforeCleaningPhoto = "";
                task.afterCleaningPhoto = "";
                task.cleaningPhotos = [];

                task.timeline.push({
                    status: isReassign ? "REASSIGNED" : "ASSIGNED",
                    timestamp: now,
                    updatedBy: req.user ? req.user.id : null,
                    prevStaff: prevStaffId,
                    newStaff: staff._id.toString(),
                    notes: notes || (isReassign ? `Reassigned to ${staff.name || staff.userId}` : `Assigned to ${staff.name || staff.userId}`)
                });

                await task.save();
            } else {
                task = await Task.create({
                    taskName: taskName || `Cleaning Task — ${device?.location || alert.location || alert.deviceId || 'Restroom'}`,
                    alert: alert._id,
                    staff: staff._id,
                    device: device ? device._id : null,
                    device_uid: alert.device_uid || device?.device_uid || alert.deviceId,
                    deviceId: alert.deviceId || device?.deviceId || alert.device_uid,
                    status: "ASSIGNED",
                    progressPercent: 0,
                    assignedAt: now,
                    reassignedAt: isReassign ? now : null,
                    assignedBy: req.user ? req.user.id : null,
                    notes: notes,
                    adminRemarks: notes,
                    timeline: [{
                        status: isReassign ? "REASSIGNED" : "ASSIGNED",
                        timestamp: now,
                        updatedBy: req.user ? req.user.id : null,
                        notes: notes || `Assigned to ${staff.name || staff.userId}`
                    }]
                });
            }

            // Update Alert document
            alert.status = "ASSIGNED";
            alert.assignedStaff = staff._id;
            alert.assignedStaffName = staff.name;
            alert.assignedStaffEmpId = staff.empId || staff.userId || "";
            alert.taskId = task._id;
            alert.taskStatus = "ASSIGNED";
            alert.taskProgressPercent = 0;
            alert.taskCleaningPhotos = [];
            alert.assignedAt = alert.assignedAt || now;
            if (isReassign) {
                alert.reassignedAt = now;
                alert.reassignedStaffName = staff.name;
                alert.reassignNotes = notes;
            }
            alert.startedAt = null;
            alert.submittedAt = null;
            alert.photosUploadedAt = null;
            alert.adminRemarks = notes;
            alert.updatedAt = now;
            await alert.save();

            // Send notifications
            try {
                const notificationService = require("../services/notificationService");
                if (isReassign) {
                    await notificationService.sendTaskReassignedNotification(task, null, staff, device);
                } else {
                    await notificationService.sendTaskAssignedNotification(task, staff, req.user, device);
                }
            } catch (err) {
                console.log("Error sending notification on assignAlert:", err.message);
            }

            // Emit sockets
            if (global.io) {
                global.io.emit("new_alert", { alertId: alert._id, status: "ASSIGNED", taskId: task._id });
                global.io.emit("task_status_updated", { taskId: task._id, alertId: alert._id, status: "ASSIGNED", progressPercent: 0, staffId: staff._id });
                global.io.emit("new_task", { taskId: task._id, status: "ASSIGNED", staffId: staff._id });
                global.io.emit("task_reassigned", { taskId: task._id, status: "ASSIGNED", staffId: staff._id });
            }

            return res.status(200).json({
                success: true,
                message: isReassign ? "Alert reassigned successfully" : "Alert assigned successfully",
                alert,
                task
            });
        } catch (error) {
            console.error("Error in assignAlert:", error);
            return res.status(500).json({ success: false, message: "Server error", error: error.message });
        }
    },
    deleteAlert: async (req, res) => { res.status(200).json({ success: true }); }
};
