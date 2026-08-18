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

            const alertConditions = [];
            const staffDeviceUids = [];
            myDevices.forEach(d => {
                if (d.device_uid) staffDeviceUids.push(d.device_uid);
                if (d.deviceId) staffDeviceUids.push(d.deviceId);
            });
            staffTasks.forEach(t => {
                if (t.device_uid) staffDeviceUids.push(t.device_uid);
                if (t.deviceId) staffDeviceUids.push(t.deviceId);
            });

            const uniqueStaffUids = Array.from(new Set(staffDeviceUids.filter(Boolean)));
            if (uniqueStaffUids.length > 0) {
                const regexUids = uniqueStaffUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
                alertConditions.push({ device_uid: { $in: regexUids } });
                alertConditions.push({ deviceId: { $in: regexUids } });
            }
            if (myDevices.length > 0) {
                alertConditions.push({ device: { $in: myDevices.map(d => d._id) } });
            }

            if (alertConditions.length > 0) {
                if (categoryConditions.length > 0) {
                    query = { $and: [{ $or: alertConditions }, { $or: categoryConditions }] };
                } else {
                    query = { $or: alertConditions };
                }
            } else {
                return res.status(200).json({ success: true, count: 0, alerts: [] });
            }

        } else if (req.user && (req.user.role === 'admin' || req.user.id)) {
            const adminIdVal = req.user.id || req.user._id;
            const isObjectId = mongoose.Types.ObjectId.isValid(adminIdVal);

            // Admin MUST ONLY see devices registered by that specific admin
            myDevices = await Device.find({
                $or: [
                    { adminId: adminIdVal },
                    ...(isObjectId ? [{ adminId: new mongoose.Types.ObjectId(adminIdVal) }] : [])
                ]
            })
            .populate("assignedStaff", "name empId userId email")
            .select("_id device_uid deviceId location floor locationName assignedStaff adminId")
            .lean();

            if (myDevices.length === 0) {
                return res.status(200).json({ success: true, count: 0, alerts: [], data: [] });
            }

            const alertConditions = [];
            const adminDeviceUids = [];
            myDevices.forEach(d => {
                if (d.device_uid) adminDeviceUids.push(d.device_uid);
                if (d.deviceId) adminDeviceUids.push(d.deviceId);
            });
            const uniqueAdminUids = Array.from(new Set(adminDeviceUids.filter(Boolean)));
            if (uniqueAdminUids.length > 0) {
                const regexUids = uniqueAdminUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
                alertConditions.push({ device_uid: { $in: regexUids } });
                alertConditions.push({ deviceId: { $in: regexUids } });
            }
            if (myDevices.length > 0) {
                alertConditions.push({ device: { $in: myDevices.map(d => d._id) } });
            }

            if (alertConditions.length > 0) {
                if (categoryConditions.length > 0) {
                    query = { $and: [{ $or: alertConditions }, { $or: categoryConditions }] };
                } else {
                    query = { $or: alertConditions };
                }
            } else {
                return res.status(200).json({ success: true, count: 0, alerts: [], data: [] });
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
        
        // Map tasks by alert ID and device UID
        const taskByAlertIdMap = new Map();
        const tasksByDeviceUidMap = new Map();

        allTasks.forEach(t => {
            if (t.alert) taskByAlertIdMap.set(t.alert.toString(), t);
            const devKey = (t.device_uid || t.deviceId || (t.device ? (t.device.device_uid || t.device.deviceId) : '') || '').toLowerCase();
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
            const devKey = (alertItem.device_uid || alertItem.deviceId || (alertItem.device ? alertItem.device.toString() : '') || '').toLowerCase();
            const devInfo = deviceMap[devKey];

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

            // DYNAMIC ASSIGNMENT RESOLUTION BASED ON CURRENT DEVICE & TASK STAFF
            const deviceStaff = devInfo ? devInfo.assignedStaff : null;
            const taskStaff = task ? task.staff : null;
            const effectiveStaff = deviceStaff || taskStaff;

            if (effectiveStaff) {
                alertItem.assignmentStatus = "ASSIGNED";
                alertItem.isAssigned = true;
                alertItem.staffId = effectiveStaff._id ? effectiveStaff._id.toString() : effectiveStaff.toString();
                alertItem.assignedStaffName = effectiveStaff.name || alertItem.assignedStaffName || "";
                alertItem.assignedStaffEmpId = effectiveStaff.empId || effectiveStaff.userId || alertItem.assignedStaffEmpId || "";
                if (alertItem.status === "OPEN") {
                    alertItem.status = "ASSIGNED";
                }
            } else {
                alertItem.assignmentStatus = "NOT_ASSIGNED";
                alertItem.isAssigned = false;
                alertItem.staffId = null;
                alertItem.assignedStaffName = null;
                alertItem.assignedStaffEmpId = null;
                if (alertItem.status !== "VERIFIED" && alertItem.status !== "RESOLVED" && alertItem.status !== "COMPLETED") {
                    alertItem.status = "OPEN";
                }
            }

            // Exclude verified/resolved alerts older than 30 days based strictly on resolvedAt timestamp
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

            // Populate comprehensive telemetry fields and aliases
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
            const latestTime = alertItem.updatedAt || alertItem.createdAt;
            alertItem.timestamp = latestTime;
            alertItem.createdAt = latestTime;

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

            const deviceStaff = devInfo ? devInfo.assignedStaff : (task.device ? task.device.assignedStaff : null);
            const taskStaff = task.staff;
            const effectiveStaff = deviceStaff || taskStaff;
            const staffIdStr = effectiveStaff ? (effectiveStaff._id ? effectiveStaff._id.toString() : effectiveStaff.toString()) : null;
            const staffNameStr = effectiveStaff ? (effectiveStaff.name || '') : null;
            const staffEmpStr = effectiveStaff ? (effectiveStaff.empId || effectiveStaff.userId || '') : null;

            const devLocStr = devInfo ? `${devInfo.location || devInfo.locationName || ''}${devInfo.floor ? ' - Floor ' + devInfo.floor : ''}` : (task.device ? task.device.location : (task.device_uid || 'Location'));
            const descStr = task.notes || task.title || 'Task Assigned';

            const syntheticAlert = {
                _id: task._id,
                id: task._id,
                alertId: task._id,
                taskId: task._id,
                device_uid: task.device_uid || task.deviceId || (task.device ? task.device.device_uid : '') || (devInfo ? devInfo.device_uid : ''),
                deviceId: devInfo ? devInfo.deviceId : (task.deviceId || task.device_uid || (task.device ? task.device.deviceId : '') || ''),
                deviceLocation: devLocStr,
                location: devLocStr,
                locationName: devInfo ? (devInfo.locationName || devInfo.location || '') : devLocStr,
                floor: devInfo ? (devInfo.floor || '') : '',
                alertType: task.title || 'TASK_ASSIGNED',
                alertCategory: 'Need Attention',
                category: 'Need Attention',
                type: task.title || 'TASK_ASSIGNED',
                title: task.title || 'TASK_ASSIGNED',
                description: descStr,
                message: descStr,
                remarks: descStr,
                adminRemarks: task.adminRemarks || '',
                feedback: 3,
                rating: 3,
                feedbackValue: 3,
                counter: 0,
                Counter: 0,
                CounterValue: 0,
                counterValue: 0,
                odor: 0,
                OdorSensVal: 0,
                OdorLevel: 0,
                odorValue: 0,
                status: isResolved ? 'VERIFIED' : (isRejected ? 'REJECTED' : (effectiveStaff ? 'ASSIGNED' : 'OPEN')),
                assignmentStatus: effectiveStaff ? 'ASSIGNED' : 'NOT_ASSIGNED',
                isAssigned: Boolean(effectiveStaff),
                taskStatus: task.status,
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
                updatedAt: task.updatedAt || task.createdAt || new Date(),
                createdAt: task.updatedAt || task.createdAt || new Date(),
                timestamp: task.updatedAt || task.createdAt || new Date(),
                staffId: staffIdStr,
                assignedStaffName: staffNameStr,
                assignedStaffEmpId: staffEmpStr,
                staff: effectiveStaff ? { _id: staffIdStr, name: staffNameStr, empId: staffEmpStr, userId: staffEmpStr } : null,
                assignedStaff: effectiveStaff ? { _id: staffIdStr, name: staffNameStr, empId: staffEmpStr, userId: staffEmpStr } : null
            };

            if (syntheticAlert.status === "RESOLVED") {
                const resolvedDate = syntheticAlert.resolvedAt || syntheticAlert.verifiedAt || syntheticAlert.completedAt;
                if (resolvedDate && new Date(resolvedDate) < thirtyDaysAgo) {
                    continue;
                }
            }

            mergedAlerts.push(syntheticAlert);
        }

        let finalAlerts = mergedAlerts;

        // Staff Role Filtering
        if (req.user && req.user.role === 'staff' && staffUserObj) {
            const staffDeviceUidsSet = new Set(
                myDevices.flatMap(d => [
                    d.device_uid ? d.device_uid.toLowerCase() : null,
                    d.deviceId ? d.deviceId.toLowerCase() : null,
                    d._id ? d._id.toString().toLowerCase() : null
                ].filter(Boolean))
            );

            const staffCreationTime = getObjectCreationTime(staffUserObj);

            finalAlerts = mergedAlerts.filter(alertItem => {
                const isResolved = alertItem.status === "RESOLVED" || alertItem.taskStatus === "VERIFIED" || alertItem.taskStatus === "COMPLETED" || alertItem.taskStatus === "RESOLVED";

                if (isResolved) return false;

                const devKey1 = (alertItem.device_uid || "").toLowerCase();
                const devKey2 = (alertItem.deviceId || "").toLowerCase();
                const isDeviceMatched = (devKey1 && staffDeviceUidsSet.has(devKey1)) || (devKey2 && staffDeviceUidsSet.has(devKey2));
                if (!isDeviceMatched) return false;

                const alertTime = getObjectCreationTime(alertItem);
                if (staffCreationTime > 0 && alertTime > 0 && alertTime < staffCreationTime) return false;

                return true;
            });
        }

        // Apply Tab / Status Query Filtering for Admin (e.g. status=not_assigned vs status=assigned)
        const rawStatus = (req.query.status || req.query.tab || req.query.assignmentStatus || '').toLowerCase();
        const statusParam = rawStatus.replace(/[\s-]/g, '_');

        if (statusParam && statusParam !== 'all') {
            if (statusParam === 'not_assigned' || statusParam === 'unassigned' || statusParam === 'open') {
                finalAlerts = finalAlerts.filter(a => a.assignmentStatus === "NOT_ASSIGNED" || a.status === "OPEN" || a.status === "NOT_ASSIGNED");
            } else if (statusParam === 'assigned') {
                finalAlerts = finalAlerts.filter(a => a.assignmentStatus === "ASSIGNED" || a.status === "ASSIGNED" || a.status === "IN_PROGRESS" || a.status === "SUBMITTED");
            } else if (statusParam === 'resolved' || statusParam === 'verified' || statusParam === 'completed') {
                finalAlerts = finalAlerts.filter(a => a.status === "VERIFIED" || a.status === "RESOLVED" || a.status === "COMPLETED");
            } else if (statusParam === 'active' || statusParam === 'pending') {
                finalAlerts = finalAlerts.filter(a => a.status !== "VERIFIED" && a.status !== "RESOLVED" && a.status !== "COMPLETED");
            }
        }

        // Sort all merged alerts/tasks by latest activity timestamp descending (newest first)
        finalAlerts.sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.timestamp || a.assignedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.updatedAt || b.timestamp || b.assignedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        res.status(200).json({
            success: true,
            count: finalAlerts.length,
            alerts: finalAlerts,
            data: finalAlerts
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