const Alert = require("../models/Alert");
const Task = require("../models/Task");
const Device = require("../models/Device");

/**
 * Business Rule:
 * For a given Device ID:
 * - If its latest existing alert is still in "Not Assigned" (status == OPEN and no assigned Task),
 *   overwrite/update that existing Not Assigned alert with the new alert data.
 * - If the existing alert/task has already been ASSIGNED, preserve it untouched and create
 *   a new Not Assigned alert for the new alert.
 */
// In-memory mutex locks per device to prevent race conditions during rapid MQTT messages
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

const processOrCreateDeviceAlertInternal = async (alertData) => {
    try {
        const { device_uid, deviceId, alertType, feedback, Counter, OdorSensVal } = alertData;
        const devUid = device_uid || deviceId;
        if (!devUid) return null;

        const devRegex = new RegExp(`^${devUid.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

        // Resolve device model if available (case-insensitive)
        const device = await Device.findOne({
            $or: [{ device_uid: devRegex }, { deviceId: devRegex }]
        });

        const targetUid = device ? device.device_uid : devUid;
        const targetDevId = device ? device.deviceId : devUid;

        // Look for open (unassigned) alerts for this device
        const openAlerts = await Alert.find({
            $or: [
                { device_uid: targetUid },
                { deviceId: targetDevId },
                ...(device ? [{ device: device._id }] : [])
            ],
            status: "OPEN"
        }).sort({ createdAt: -1 });

        let existingUnassignedAlert = null;

        for (const alt of openAlerts) {
            // Check if this alert is linked to an assigned task
            const linkedTask = await Task.findOne({
                alert: alt._id,
                status: { $nin: ["CANCELLED"] }
            });

            // If no active task or task has no staff assigned, it is truly Unassigned
            if (!linkedTask || !linkedTask.staff) {
                existingUnassignedAlert = alt;
                break;
            }
        }

        let resultAlert;
        let isOverwritten = false;

        if (existingUnassignedAlert) {
            // SCENARIO 1: Overwrite existing Not Assigned alert with latest parameters
            existingUnassignedAlert.alertType = alertType || existingUnassignedAlert.alertType;
            if (feedback !== undefined) existingUnassignedAlert.feedback = feedback;
            if (Counter !== undefined) existingUnassignedAlert.Counter = Counter;
            if (OdorSensVal !== undefined) existingUnassignedAlert.OdorSensVal = OdorSensVal;
            existingUnassignedAlert.status = "OPEN";
            existingUnassignedAlert.createdAt = new Date(); // Refresh timestamp for new alert
            await existingUnassignedAlert.save();

            resultAlert = existingUnassignedAlert;
            isOverwritten = true;
            console.log(`🔄 Overwrote Not Assigned alert for device ${targetUid}: ${alertType}`);
        } else {
            // SCENARIO 2: Existing alert was Assigned (or no alert exists) -> Create new Not Assigned alert
            resultAlert = await Alert.create({
                device_uid: targetUid,
                device: device ? device._id : null,
                alertType: alertType,
                feedback: feedback !== undefined ? feedback : 0,
                Counter: Counter !== undefined ? Counter : 0,
                OdorSensVal: OdorSensVal !== undefined ? OdorSensVal : 0,
                status: "OPEN"
            });

            isOverwritten = false;
            console.log(`🚨 Created NEW Not Assigned alert for device ${targetUid}: ${alertType}`);
        }

        return { alert: resultAlert, device, isOverwritten };
    } catch (error) {
        console.error("Error in processOrCreateDeviceAlert:", error);
        throw error;
    }
};

module.exports = {
    processOrCreateDeviceAlert
};
