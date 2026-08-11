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

        const { type } = req.query;

        let query = {};

        if (type === "critical") {

            query.feedback = 4;

        }

        if (type === "attention") {

            query.feedback = 3;

        }

        // Filter alerts by user role (admin devices vs staff assigned devices)
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

            // Include devices linked to tasks or alerts directly assigned to this staff member
            const staffTasks = await Task.find({ staff: staffUserObj._id }).select("device device_uid deviceId").lean();
            const staffAlerts = await Alert.find({ assignedStaff: staffUserObj._id }).select("device_uid deviceId").lean();

            staffTasks.forEach(t => {
                if (t.device) devConditions.push({ _id: t.device });
                if (t.device_uid) devConditions.push({ device_uid: t.device_uid });
                if (t.deviceId) devConditions.push({ deviceId: t.deviceId });
            });

            staffAlerts.forEach(a => {
                if (a.device_uid) devConditions.push({ device_uid: a.device_uid });
                if (a.deviceId) devConditions.push({ deviceId: a.deviceId });
            });

            myDevices = await Device.find({
                $or: devConditions
            }).select("_id device_uid deviceId location floor").lean();

            const allDeviceUids = [
                ...myDevices.flatMap(d => [d.device_uid, d.deviceId, d._id ? d._id.toString() : null].filter(Boolean)),
                ...staffTasks.flatMap(t => [t.device_uid, t.deviceId, t.device ? t.device.toString() : null].filter(Boolean)),
                ...staffAlerts.flatMap(a => [a.device_uid, a.deviceId].filter(Boolean))
            ];

            const uniqueUids = Array.from(new Set(allDeviceUids));

            if (uniqueUids.length > 0) {
                const regexUids = uniqueUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
                query.$or = [
                    { device_uid: { $in: regexUids } },
                    { deviceId: { $in: regexUids } },
                    { assignedStaff: staffUserObj._id }
                ];
            } else {
                query.$or = [
                    { assignedStaff: staffUserObj._id }
                ];
            }
        } else if (req.user && req.user.role === 'admin') {
            myDevices = await Device.find({ adminId: req.user.id }).select("_id device_uid deviceId location floor").lean();

            if (myDevices.length === 0) {
                myDevices = await Device.find().select("_id device_uid deviceId location floor").lean();
            }
        } else {
            myDevices = await Device.find().select("_id device_uid deviceId location floor").lean();
        }

        const deviceMap = {};
        myDevices.forEach(d => {
            if (d.device_uid) deviceMap[d.device_uid.toLowerCase()] = d;
            if (d.deviceId) deviceMap[d.deviceId.toLowerCase()] = d;
        });

        if (req.user && req.user.role === 'admin') {
            const allDeviceUids = myDevices.flatMap(d => [d.device_uid, d.deviceId, d._id ? d._id.toString() : null].filter(Boolean));
            if (allDeviceUids.length > 0) {
                const regexUids = allDeviceUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
                query.$or = [
                    { device_uid: { $in: regexUids } },
                    { deviceId: { $in: regexUids } },
                    { device: { $in: myDevices.map(d => d._id) } }
                ];
            }
        }

        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        let alerts = await Alert.find(query).sort({ createdAt: -1 }).lean();

        // Fallback: If query returned 0 alerts for admin, fetch all system alerts so screen is not empty
        if (alerts.length === 0 && (!req.user || req.user.role === 'admin')) {
            const fallbackQuery = { ...query };
            delete fallbackQuery.$or;
            alerts = await Alert.find(fallbackQuery).sort({ createdAt: -1 }).lean();
        }

        // Bulk fetch all tasks
        const allTasks = await Task.find().populate("staff", "name empId userId").sort({ createdAt: -1 }).lean();
        
        // Map tasks by alert ID and device UID
        const taskByAlertIdMap = new Map();
        const tasksByDeviceUidMap = new Map();

        allTasks.forEach(t => {
            if (t.alert) taskByAlertIdMap.set(t.alert.toString(), t);
            const devKey = (t.device_uid || t.deviceId || '').toLowerCase();
            if (devKey) {
                if (!tasksByDeviceUidMap.has(devKey)) tasksByDeviceUidMap.set(devKey, []);
                tasksByDeviceUidMap.get(devKey).push(t);
            }
        });

        const mergedAlerts = [];
        const processedTaskIds = new Set();

        // 1. Process all existing Alert collection records
        for (let i = 0; i < alerts.length; i++) {
            const alertItem = { ...alerts[i] };
            const alertIdStr = alertItem._id ? alertItem._id.toString() : '';
            const devKey = (alertItem.device_uid || alertItem.deviceId || '').toLowerCase();

            // Find matching task strictly by alert ID first, or fallback to devKey only if alert status is ASSIGNED
            let task = taskByAlertIdMap.get(alertIdStr);
            if (!task && alertItem.status === "ASSIGNED" && devKey && tasksByDeviceUidMap.has(devKey)) {
                const devTasks = tasksByDeviceUidMap.get(devKey);
                task = devTasks.find(t => !processedTaskIds.has(t._id.toString()));
            }

            if (task) {
                processedTaskIds.add(task._id.toString());
                alertItem.taskId = task._id;
                alertItem.taskStatus = task.status;
                alertItem.adminRemarks = task.adminRemarks || alertItem.adminRemarks || "";
                alertItem.taskProgressPercent = (task.status === "VERIFIED" || task.status === "COMPLETED" || task.status === "RESOLVED") ? 100 : (task.progressPercent || 0);

                if (task.status === "VERIFIED" || task.status === "COMPLETED" || task.status === "RESOLVED") {
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

            // Exclude verified/resolved alerts older than 15 days based strictly on resolvedAt timestamp
            if (alertItem.status === "VERIFIED" || alertItem.status === "RESOLVED") {
                const resolvedDate = alertItem.resolvedAt || alertItem.verifiedAt || alertItem.completedAt || alertItem.updatedAt;
                if (resolvedDate && new Date(resolvedDate) < fifteenDaysAgo) {
                    continue;
                }
            }

            const devInfo = deviceMap[devKey];
            if (devInfo) {
                alertItem.deviceId = devInfo.deviceId || alertItem.device_uid;
                alertItem.deviceLocation = `${devInfo.location || ''}${devInfo.floor ? ' - Floor ' + devInfo.floor : ''}`;
            } else {
                alertItem.deviceId = alertItem.device_uid || 'Device';
                alertItem.deviceLocation = alertItem.device_uid || 'Location';
            }

            mergedAlerts.push(alertItem);
        }

        // 2. Ensure ALL remaining tasks (not linked to an Alert record) are also included so NO task ever vanishes!
        for (let i = 0; i < allTasks.length; i++) {
            const task = allTasks[i];
            const taskIdStr = task._id.toString();
            if (processedTaskIds.has(taskIdStr)) continue;

            const devKey = (task.device_uid || task.deviceId || '').toLowerCase();
            const devInfo = deviceMap[devKey];

            // For staff users, only include synthetic alerts for tasks assigned to them or matching their devices
            if (req.user && req.user.role === 'staff') {
                const taskStaffId = task.staff ? (task.staff._id ? task.staff._id.toString() : task.staff.toString()) : '';
                const isMyTask = taskStaffId === req.user.id.toString();
                const isMyDevice = Boolean(devKey && deviceMap[devKey]);
                if (!isMyTask && !isMyDevice) continue;
            }

            let photos = [];
            if (Array.isArray(task.cleaningPhotos) && task.cleaningPhotos.length > 0) {
                photos = task.cleaningPhotos.map(p => typeof p === "string" ? p : (p.url || p.path || ""));
            }
            if (photos.length === 0) {
                if (task.beforeCleaningPhoto) photos.push(task.beforeCleaningPhoto);
                if (task.afterCleaningPhoto) photos.push(task.afterCleaningPhoto);
            }

            const isResolved = task.status === "VERIFIED" || task.status === "COMPLETED" || task.status === "RESOLVED";
            const isRejected = task.status === "REJECTED";
            const synReassignStep = Array.isArray(task.timeline) ? task.timeline.find(step => step.status === "REASSIGNED") : null;

            const syntheticAlert = {
                _id: task._id,
                taskId: task._id,
                device_uid: task.device_uid || task.deviceId || (devInfo ? devInfo.device_uid : ''),
                deviceId: devInfo ? devInfo.deviceId : (task.deviceId || task.device_uid || ''),
                deviceLocation: devInfo ? `${devInfo.location || ''}${devInfo.floor ? ' - Floor ' + devInfo.floor : ''}` : (task.device_uid || ''),
                alertType: task.title || 'TASK_ASSIGNED',
                feedback: 3,
                status: isResolved ? 'VERIFIED' : (isRejected ? 'REJECTED' : 'ASSIGNED'),
                taskStatus: task.status,
                adminRemarks: task.adminRemarks || '',
                taskProgressPercent: isResolved ? 100 : (task.progressPercent || 0),
                taskCleaningPhotos: photos.filter(Boolean),
                assignedAt: task.assignedAt || task.createdAt,
                reassignedAt: synReassignStep ? synReassignStep.timestamp : null,
                reassignNotes: synReassignStep ? synReassignStep.notes : (task.notes || ''),
                startedAt: task.startedAt,
                photosUploadedAt: task.photosUploadedAt,
                submittedAt: task.submittedAt,
                completedAt: task.completedAt,
                verifiedAt: task.verifiedAt,
                resolvedAt: task.resolvedAt || task.verifiedAt || task.completedAt,
                createdAt: task.createdAt || new Date(),
                staffId: task.staff ? (task.staff._id ? task.staff._id.toString() : task.staff.toString()) : '',
                assignedStaffName: task.staff ? task.staff.name : '',
                assignedStaffEmpId: task.staff ? (task.staff.empId || task.staff.userId || '') : ''
            };

            // Exclude resolved tasks older than 15 days based strictly on resolvedAt timestamp
            if (syntheticAlert.status === "RESOLVED") {
                const resolvedDate = syntheticAlert.resolvedAt || syntheticAlert.verifiedAt || syntheticAlert.completedAt;
                if (resolvedDate && new Date(resolvedDate) < fifteenDaysAgo) {
                    continue;
                }
            }

            mergedAlerts.push(syntheticAlert);
        }

        let finalAlerts = mergedAlerts;
        if (req.user && req.user.role === 'staff' && staffUserObj) {
            const staffDeviceUidsSet = new Set(
                myDevices.flatMap(d => [
                    d.device_uid ? d.device_uid.toLowerCase() : null,
                    d.deviceId ? d.deviceId.toLowerCase() : null,
                    d._id ? d._id.toString().toLowerCase() : null
                ].filter(Boolean))
            );

            finalAlerts = mergedAlerts.filter(alertItem => {
                const isResolved = alertItem.status === "RESOLVED" || alertItem.taskStatus === "VERIFIED" || alertItem.taskStatus === "COMPLETED" || alertItem.taskStatus === "RESOLVED";

                // Staff sees NO resolved alarms (Resolved alarms tab removed)
                if (isResolved) {
                    return false;
                }

                // Verify device match
                const devKey1 = (alertItem.device_uid || "").toLowerCase();
                const devKey2 = (alertItem.deviceId || "").toLowerCase();
                const isDeviceMatched = (devKey1 && staffDeviceUidsSet.has(devKey1)) || (devKey2 && staffDeviceUidsSet.has(devKey2));
                if (!isDeviceMatched) {
                    return false;
                }

                // Verify alert creation timestamp is strictly AFTER staff creation timestamp!
                const alertTime = getObjectCreationTime(alertItem);
                if (staffCreationTime > 0 && alertTime > 0 && alertTime < staffCreationTime) {
                    return false;
                }

                return true;
            });
        }

        // Sort all merged alerts/tasks by createdAt descending
        finalAlerts.sort((a, b) => new Date(b.createdAt || b.assignedAt) - new Date(a.createdAt || a.assignedAt));

        res.status(200).json({
            success: true,
            count: finalAlerts.length,
            alerts: finalAlerts
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const getAlertDetails = async (req, res) => {

    try {

        const alert =
        await Alert.findById(
            req.params.alertId
        );

        if (!alert) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });

        }

        const device =
        await Device.findOne({
            device_uid:
            alert.device_uid
        });

        const latestSensor =
        await SensorData.findOne({
            device_uid:
            alert.device_uid
        })
        .sort({
            timestamp: -1
        });

        res.status(200).json({

            success: true,

            alert,

            device,

            latestSensor

        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const resolveAlert = async (req, res) => {

    try {

        const alertId = req.params.alertId || req.body.alertId;

        const alert =
        await Alert.findById(alertId);

        if (!alert) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });

        }

        const now = new Date();
        alert.status = "RESOLVED";
        alert.resolvedAt = alert.resolvedAt || now;
        await alert.save();

        // Also update associated task if it exists
        const task = await Task.findOne({ alert: alert._id });
        if (task) {
            task.status = "VERIFIED";
            task.progressPercent = 100;
            task.verifiedAt = task.verifiedAt || now;
            task.completedAt = task.completedAt || now;
            task.resolvedAt = task.resolvedAt || now;
            await task.save();
            if (global.io) {
                global.io.emit("task_status_updated", { taskId: task._id, status: "VERIFIED", progressPercent: 100 });
            }
        }

        if (global.io) {
            global.io.emit("new_alert", { alertId: alert._id, status: "RESOLVED" });
        }

        // Automatically mark all unread notifications read for this alert
        try {
            const { markNotificationsReadForAlert } = require("../services/notificationService");
            await markNotificationsReadForAlert(alert._id);
        } catch (err) {
            console.log("Error clearing alert notifications on resolve:", err.message);
        }

        res.status(200).json({
            success: true,
            message: "Alert Resolved"
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const assignAlert = async (req, res) => {
    try {
        const { staff_id, taskName, notes } = req.body;
        const alertId = req.params.alertId;
        
        const alert = await Alert.findById(alertId);
        if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
        
        const isObjectId = mongoose.Types.ObjectId.isValid(staff_id);
        let staff = null;
        if (isObjectId) {
            staff = await User.findOne({ _id: staff_id, role: "staff" });
        }
        if (!staff) {
            staff = await User.findOne({ 
                $or: [{ userId: staff_id }, { email: staff_id }], 
                role: "staff" 
            });
        }
        if (!staff) {
            staff = await User.findOne({ 
                $or: [{ _id: isObjectId ? staff_id : null }, { userId: staff_id }, { email: staff_id }]
            });
        }
        if (!staff) return res.status(404).json({ success: false, message: "Staff member not found" });

        const device = await Device.findOne({
            $or: [
                { device_uid: alert.device_uid },
                { deviceId: alert.device_uid },
                { device_uid: alert.deviceId },
                { deviceId: alert.deviceId }
            ]
        });
        
        const now = new Date();
        const task = await Task.create({
            alert: alert._id,
            taskName: taskName || alert.title || "Restroom Cleaning & Hygiene Task",
            title: taskName || alert.title || "Restroom Cleaning & Hygiene Task",
            device: device ? device._id : null,
            staff: staff._id,
            assignedBy: req.user ? req.user.id : null,
            assignedAt: now,
            status: "ASSIGNED",
            notes: notes || "Assigned by Admin",
            timeline: [{
                status: "ASSIGNED",
                timestamp: now,
                updatedBy: req.user ? req.user.id : null,
                notes: "Alert task assigned by admin"
            }]
        });

        alert.status = "ASSIGNED";
        await alert.save();
        
        if (device) {
            device.assignedStaff = staff._id;
            await device.save();
            staff.assignedDevice = device._id;
            await staff.save();
        }

        try {
            const notificationService = require("../services/notificationService");
            notificationService.sendTaskAssignedNotification(task, staff, req.user, device);
        } catch (err) {
            console.log("Error sending notification:", err.message);
        }

        if (global.io) {
            global.io.emit("task_status_updated", { taskId: task._id, status: "ASSIGNED", staffId: staff._id });
        }

        res.status(200).json({ success: true, message: "Alert assigned successfully", task });
    } catch (error) {
        console.log("Error in assignAlert:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const deleteAlert = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access Denied: Only admins can delete alerts"
            });
        }

        const alert = await Alert.findById(req.params.alertId);
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }

        // Verify that the alert is for a device belonging to the admin
        const device = await Device.findOne({ device_uid: alert.device_uid, adminId: req.user.id });
        if (!device) {
            return res.status(403).json({
                success: false,
                message: "Access Denied: You do not manage the device for this alert"
            });
        }

        // Delete associated tasks if they exist
        await Task.deleteMany({ alert: req.params.alertId });

        // Delete the alert
        await Alert.findByIdAndDelete(req.params.alertId);

        res.status(200).json({
            success: true,
            message: "Alert deleted successfully"
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

module.exports = {

    getAlerts,

    getAlertDetails,

    resolveAlert,
    
    assignAlert,

    deleteAlert

};