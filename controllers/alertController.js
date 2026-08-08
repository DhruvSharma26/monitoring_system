const Alert = require("../models/Alert");
const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const User = require("../models/User");
const Task = require("../models/Task");

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
        if (req.user && req.user.role === 'staff') {
            const staffUser = await User.findById(req.user.id);
            const assignedDevId = staffUser ? staffUser.assignedDevice : null;
            
            const devConditions = [
                { assignedStaff: req.user.id }
            ];
            if (assignedDevId) {
                devConditions.push({ _id: assignedDevId });
                devConditions.push({ device_uid: assignedDevId });
                devConditions.push({ deviceId: assignedDevId });
            }

            myDevices = await Device.find({
                $or: devConditions
            }).select("device_uid deviceId location floor").lean();
        } else {
            const adminDevices = await Device.find({ adminId: req.user.id }).select("device_uid deviceId location floor").lean();
            if (adminDevices.length > 0) {
                myDevices = adminDevices;
            } else {
                myDevices = await Device.find().select("device_uid deviceId location floor").lean();
            }
        }

        const deviceMap = {};
        myDevices.forEach(d => {
            if (d.device_uid) deviceMap[d.device_uid.toLowerCase()] = d;
            if (d.deviceId) deviceMap[d.deviceId.toLowerCase()] = d;
        });

        const allDeviceUids = myDevices.flatMap(d => [d.device_uid, d.deviceId, d._id ? d._id.toString() : null].filter(Boolean));
        if (allDeviceUids.length > 0) {
            const regexUids = allDeviceUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
            query.$or = [
                { device_uid: { $in: regexUids } },
                { deviceId: { $in: regexUids } }
            ];
        }

        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        let alerts = await Alert.find(query).sort({ createdAt: -1 }).lean();

        // Fallback: If query returned 0 alerts and user is admin/system, fetch all system alerts
        if (alerts.length === 0 && (!req.user || req.user.role !== 'staff')) {
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

            // Find matching task by alert ID or by device UID
            let task = taskByAlertIdMap.get(alertIdStr);
            if (!task && devKey && tasksByDeviceUidMap.has(devKey)) {
                const devTasks = tasksByDeviceUidMap.get(devKey);
                task = devTasks.find(t => !processedTaskIds.has(t._id.toString())) || devTasks[0];
            }

            if (task) {
                processedTaskIds.add(task._id.toString());
                alertItem.taskId = task._id;
                alertItem.taskStatus = task.status;
                alertItem.taskProgressPercent = (task.status === "VERIFIED" || task.status === "COMPLETED" || task.status === "RESOLVED") ? 100 : (task.progressPercent || 0);

                if (task.status === "VERIFIED" || task.status === "COMPLETED" || task.status === "RESOLVED") {
                    alertItem.status = "RESOLVED";
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

                alertItem.assignedAt = task.assignedAt;
                alertItem.startedAt = task.startedAt;
                alertItem.photosUploadedAt = task.photosUploadedAt;
                alertItem.submittedAt = task.submittedAt;
                alertItem.completedAt = task.completedAt;
                alertItem.verifiedAt = task.verifiedAt;
                if (task.staff) {
                    alertItem.assignedStaffName = task.staff.name;
                    alertItem.assignedStaffEmpId = task.staff.empId || task.staff.userId || "";
                }
            } else if (!alertItem.taskCleaningPhotos) {
                alertItem.taskCleaningPhotos = [];
            }

            // Exclude resolved alerts older than 15 days
            if (alertItem.status === "RESOLVED") {
                const resolvedDate = alertItem.verifiedAt || alertItem.completedAt || alertItem.updatedAt || alertItem.createdAt;
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

            let photos = [];
            if (Array.isArray(task.cleaningPhotos) && task.cleaningPhotos.length > 0) {
                photos = task.cleaningPhotos.map(p => typeof p === "string" ? p : (p.url || p.path || ""));
            }
            if (photos.length === 0) {
                if (task.beforeCleaningPhoto) photos.push(task.beforeCleaningPhoto);
                if (task.afterCleaningPhoto) photos.push(task.afterCleaningPhoto);
            }

            const isResolved = task.status === "VERIFIED" || task.status === "COMPLETED" || task.status === "RESOLVED";

            const syntheticAlert = {
                _id: task._id,
                taskId: task._id,
                device_uid: task.device_uid || task.deviceId || (devInfo ? devInfo.device_uid : ''),
                deviceId: devInfo ? devInfo.deviceId : (task.deviceId || task.device_uid || ''),
                deviceLocation: devInfo ? `${devInfo.location || ''}${devInfo.floor ? ' - Floor ' + devInfo.floor : ''}` : (task.device_uid || ''),
                alertType: task.title || 'TASK_ASSIGNED',
                feedback: 3,
                status: isResolved ? 'RESOLVED' : 'OPEN',
                taskStatus: task.status,
                taskProgressPercent: isResolved ? 100 : (task.progressPercent || 0),
                taskCleaningPhotos: photos.filter(Boolean),
                assignedAt: task.assignedAt || task.createdAt,
                startedAt: task.startedAt,
                photosUploadedAt: task.photosUploadedAt,
                submittedAt: task.submittedAt,
                completedAt: task.completedAt,
                verifiedAt: task.verifiedAt,
                createdAt: task.createdAt || new Date(),
                assignedStaffName: task.staff ? task.staff.name : '',
                assignedStaffEmpId: task.staff ? (task.staff.empId || task.staff.userId || '') : ''
            };

            // Exclude resolved tasks older than 15 days
            if (syntheticAlert.status === "RESOLVED") {
                const resolvedDate = syntheticAlert.verifiedAt || syntheticAlert.completedAt || syntheticAlert.createdAt;
                if (resolvedDate && new Date(resolvedDate) < fifteenDaysAgo) {
                    continue;
                }
            }

            mergedAlerts.push(syntheticAlert);
        }

        // Sort all merged alerts/tasks by createdAt descending
        mergedAlerts.sort((a, b) => new Date(b.createdAt || b.assignedAt) - new Date(a.createdAt || a.assignedAt));

        res.status(200).json({
            success: true,
            count: mergedAlerts.length,
            alerts: mergedAlerts
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

        alert.status = "RESOLVED";
        await alert.save();

        // Also update associated task if it exists
        const task = await Task.findOne({ alert: alert._id });
        if (task) {
            task.status = "VERIFIED";
            task.progressPercent = 100;
            task.verifiedAt = task.verifiedAt || new Date();
            task.completedAt = task.completedAt || new Date();
            await task.save();
            if (global.io) {
                global.io.emit("task_status_updated", { taskId: task._id, status: "VERIFIED", progressPercent: 100 });
            }
        }

        if (global.io) {
            global.io.emit("new_alert", { alertId: alert._id, status: "RESOLVED" });
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
        const { staff_id } = req.body;
        const alertId = req.params.alertId;
        
        const alert = await Alert.findById(alertId);
        if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
        
        const staff = await User.findOne({ 
            $or: [{ userId: staff_id }, { empId: staff_id }], 
            role: "staff" 
        });
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });

        const device = await Device.findOne({ device_uid: alert.device_uid });
        
        const task = await Task.create({
            alert: alert._id,
            device: device ? device._id : null,
            staff: staff._id,
            assignedBy: req.user.id,
            status: "ASSIGNED"
        });

        alert.status = "ASSIGNED";
        await alert.save();
        
        // Notify assigned staff
        const notificationService = require("../services/notificationService");
        notificationService.sendTaskAssignedNotification(task, staff, req.user, device);

        res.status(200).json({ success: true, message: "Alert assigned" });
    } catch (error) {
        console.log(error);
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