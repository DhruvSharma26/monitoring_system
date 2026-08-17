const Alert = require("../models/Alert");
const Task = require("../models/Task");
const Device = require("../models/Device");
const User = require("../models/User");
const Assignment = require("../models/Assignment");

const alertProcessingLocks = new Map();

const processOrCreateDeviceAlert = async (alertData) => {
    const devUid = alertData.device_uid || alertData.deviceId;
    if (!devUid) return null;

    const lockKey = devUid.toLowerCase();
    const existingLock = alertProcessingLocks.get(lockKey) || Promise.resolve();

    let releaseLock;
    const newLock = new Promise(resolve => { releaseLock = resolve; });
    alertProcessingLocks.set(lockKey, existingLock.then(() => newLock));

    await existingLock;
    try {
        return await processOrCreateDeviceAlertInternal(alertData);
    } finally {
        releaseLock();
        if (alertProcessingLocks.get(lockKey) === newLock) {
            alertProcessingLocks.delete(lockKey);
        }
    }
};

const resolveOpenAlertsForDevice = async (devUid) => {
    try {
        if (!devUid) return;
        const devRegex = new RegExp(`^${devUid.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
        const device = await Device.findOne({
            $or: [{ device_uid: devRegex }, { deviceId: devRegex }]
        });

        const targetUid = device ? device.device_uid : devUid;
        const targetDevId = device ? device.deviceId : devUid;

        const openAlerts = await Alert.find({
            $or: [
                { device_uid: targetUid },
                { deviceId: targetDevId },
                ...(device ? [{ device: device._id }] : [])
            ],
            status: { $in: ["OPEN", "ASSIGNED"] }
        });

        for (const alt of openAlerts) {
            const linkedTask = await Task.findOne({
                alert: alt._id,
                status: { $nin: ["CANCELLED"] }
            });

            // Only auto-resolve if linked task hasn't been started yet by staff
            if (!linkedTask || linkedTask.status === "ASSIGNED") {
                alt.status = "RESOLVED";
                alt.resolvedAt = new Date();
                await alt.save();

                if (linkedTask) {
                    linkedTask.status = "COMPLETED";
                    linkedTask.completedAt = new Date();
                    await linkedTask.save();
                }
            }
        }
    } catch (err) {
        console.error("Error in resolveOpenAlertsForDevice:", err);
    }
};

const processOrCreateDeviceAlertInternal = async (alertData) => {
    try {
        const {
            device_uid,
            deviceId,
            alertCategory,
            alertType,
            alertSubtype,
            rating,
            toiletStatus,
            description,
            feedback,
            Counter,
            OdorSensVal,
            counterThreshold,
            odorThreshold,
            counterValue,
            odorValue,
            feedbackValue,
            counterSeverity,
            odorSeverity,
            feedbackSeverity,
            triggeredValues
        } = alertData;

        const devUid = device_uid || deviceId;
        if (!devUid) return null;

        const devRegex = new RegExp(`^${devUid.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

        const device = await Device.findOne({
            $or: [{ device_uid: devRegex }, { deviceId: devRegex }]
        });

        if (!device) {
            console.log(`⚠️ processOrCreateDeviceAlert: Device not found for [${devUid}] — skipping alert processing.`);
            return null;
        }

        const targetUid = device.device_uid;
        const targetDevId = device.deviceId;

        let assignedStaffId = device.assignedStaff || null;
        if (!assignedStaffId) {
            const activeAsgn = await Assignment.findOne({ device: device._id, status: "ACTIVE" });
            if (activeAsgn) assignedStaffId = activeAsgn.staff;
        }

        const initialAlertStatus = assignedStaffId ? "ASSIGNED" : "OPEN";

        const openAlerts = await Alert.find({
            $or: [
                { device_uid: targetUid },
                { deviceId: targetDevId },
                ...(device ? [{ device: device._id }] : [])
            ],
            status: { $in: ["OPEN", "ASSIGNED"] }
        }).sort({ createdAt: -1 });

        let existingUnassignedAlert = null;
        for (const alt of openAlerts) {
            const linkedTask = await Task.findOne({
                alert: alt._id,
                status: { $nin: ["CANCELLED"] }
            });

            if (!linkedTask || linkedTask.status === "ASSIGNED") {
                existingUnassignedAlert = alt;
                break;
            }
        }

        const normalizedCategory = alertCategory || (alertType === "CRITICAL" ? "Critical" : "Need Attention");

        let resultAlert;
        let isOverwritten = false;

        if (existingUnassignedAlert) {
            existingUnassignedAlert.alertCategory = normalizedCategory;
            existingUnassignedAlert.alertType = alertType || existingUnassignedAlert.alertType;
            if (alertSubtype !== undefined) existingUnassignedAlert.alertSubtype = alertSubtype;
            if (rating !== undefined) existingUnassignedAlert.rating = rating;
            if (toiletStatus !== undefined) existingUnassignedAlert.toiletStatus = toiletStatus;
            if (description !== undefined) existingUnassignedAlert.description = description;

            existingUnassignedAlert.feedback = feedback !== undefined ? feedback : existingUnassignedAlert.feedback;
            existingUnassignedAlert.Counter = Counter !== undefined ? Counter : existingUnassignedAlert.Counter;
            existingUnassignedAlert.CounterValue = Counter !== undefined ? Counter : existingUnassignedAlert.CounterValue;
            existingUnassignedAlert.OdorSensVal = OdorSensVal !== undefined ? OdorSensVal : existingUnassignedAlert.OdorSensVal;
            existingUnassignedAlert.OdorLevel = OdorSensVal !== undefined ? OdorSensVal : existingUnassignedAlert.OdorLevel;

            if (counterThreshold !== undefined) existingUnassignedAlert.counterThreshold = counterThreshold;
            if (odorThreshold !== undefined) existingUnassignedAlert.odorThreshold = odorThreshold;
            if (counterValue !== undefined) existingUnassignedAlert.counterValue = counterValue;
            if (odorValue !== undefined) existingUnassignedAlert.odorValue = odorValue;
            if (feedbackValue !== undefined) existingUnassignedAlert.feedbackValue = feedbackValue;

            if (counterSeverity !== undefined) existingUnassignedAlert.counterSeverity = counterSeverity;
            if (odorSeverity !== undefined) existingUnassignedAlert.odorSeverity = odorSeverity;
            if (feedbackSeverity !== undefined) existingUnassignedAlert.feedbackSeverity = feedbackSeverity;

            if (triggeredValues !== undefined) existingUnassignedAlert.triggeredValues = triggeredValues;

            existingUnassignedAlert.status = initialAlertStatus;
            existingUnassignedAlert.createdAt = new Date();
            await existingUnassignedAlert.save();

            resultAlert = existingUnassignedAlert;
            isOverwritten = true;
            console.log(`Overwrote alert for device ${targetUid}: ${normalizedCategory}`);
        } else {
            resultAlert = await Alert.create({
                device_uid: targetUid,
                deviceId: targetDevId,
                device: device ? device._id : null,
                alertCategory: normalizedCategory,
                alertType: alertType || normalizedCategory,
                alertSubtype: alertSubtype,
                rating: rating,
                toiletStatus: toiletStatus,
                description: description,
                feedback: feedback !== undefined ? feedback : 0,
                Counter: Counter !== undefined ? Counter : 0,
                CounterValue: Counter !== undefined ? Counter : 0,
                OdorSensVal: OdorSensVal !== undefined ? OdorSensVal : 0,
                OdorLevel: OdorSensVal !== undefined ? OdorSensVal : 0,

                counterThreshold,
                odorThreshold,
                counterValue,
                odorValue,
                feedbackValue,

                counterSeverity,
                odorSeverity,
                feedbackSeverity,

                triggeredValues: triggeredValues || [],

                status: initialAlertStatus
            });

            isOverwritten = false;
            console.log(`Created NEW alert (${initialAlertStatus}) for device ${targetUid}: ${normalizedCategory}`);
        }

        // AUTOMATIC TASK ASSIGNMENT TO ASSIGNED STAFF
        if (assignedStaffId && device) {
            const existingTask = await Task.findOne({ alert: resultAlert._id });
            if (!existingTask) {
                const now = new Date();
                const newTask = await Task.create({
                    taskName: `Restroom Maintenance - ${device.locationName || device.location || targetUid}`,
                    title: `${normalizedCategory} Maintenance Task`,
                    alert: resultAlert._id,
                    device: device._id,
                    staff: assignedStaffId,
                    status: "ASSIGNED",
                    priority: normalizedCategory === "Critical" ? "high" : "medium",
                    assignedAt: now,
                    notes: `Automatically assigned based on device ownership. ${description}`,
                    timeline: [{
                        status: "ASSIGNED",
                        timestamp: now,
                        notes: "Automatically assigned to device owner staff member"
                    }]
                });

                try {
                    const notificationService = require("./notificationService");
                    const staffUser = await User.findById(assignedStaffId);
                    if (staffUser) {
                        notificationService.sendTaskAssignedNotification(newTask, staffUser, null, device);
                    }
                } catch (err) {
                    console.log("Error sending automatic task notification:", err.message);
                }

                if (global.io) {
                    global.io.emit("new_task", { taskId: newTask._id, status: "ASSIGNED", staffId: assignedStaffId });
                }
            } else if (existingTask.status === "ASSIGNED" && !existingTask.startedAt && existingTask.staff.toString() !== assignedStaffId.toString()) {
                const oldStaffId = existingTask.staff ? existingTask.staff.toString() : null;
                const oldStaffUser = oldStaffId ? await User.findById(oldStaffId) : null;
                const newStaffUser = await User.findById(assignedStaffId);
                const now = new Date();

                existingTask.staff = assignedStaffId;
                existingTask.reassignedAt = now;
                existingTask.timeline.push({
                    status: "REASSIGNED",
                    timestamp: now,
                    prevStaff: oldStaffId,
                    newStaff: assignedStaffId.toString(),
                    notes: "Automatically reassigned based on device ownership"
                });
                await existingTask.save();

                try {
                    const notificationService = require("./notificationService");
                    if (oldStaffUser && newStaffUser) {
                        await notificationService.sendTaskReassignedNotification(existingTask, oldStaffUser, newStaffUser, device);
                    } else if (newStaffUser) {
                        await notificationService.sendTaskAssignedNotification(existingTask, newStaffUser, null, device);
                    }
                } catch (nErr) {
                    console.log("Error sending automatic task reassignment notification:", nErr.message);
                }

                if (global.io) {
                    global.io.emit("task_reassigned", { taskId: existingTask._id, status: "ASSIGNED", staffId: assignedStaffId });
                    global.io.emit("task_status_updated", { taskId: existingTask._id, status: "ASSIGNED", staffId: assignedStaffId });
                }
            }
        }

        return { alert: resultAlert, device, isOverwritten };
    } catch (error) {
        console.error("Error in processOrCreateDeviceAlert:", error);
        throw error;
    }
};

module.exports = {
    processOrCreateDeviceAlert,
    resolveOpenAlertsForDevice
};
