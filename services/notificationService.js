const Notification = require("../models/Notification");
const User = require("../models/User");
const Device = require("../models/Device");
const { sendPushNotification } = require("../config/firebase");

/**
 * Handle notification dispatch when an alert is created from MQTT feedback/sensor data.
 * Notifies ONLY the specific Admin who registered the device and the Assigned Staff.
 */
async function handleMqttAlertNotification(sensorPayload, alertType, alertDoc) {
    try {
        const deviceUid = sensorPayload.device_uid;

        // 1. Locate Device details (support both device_uid and deviceId)
        const device = await Device.findOne({
            $or: [{ device_uid: deviceUid }, { deviceId: deviceUid }]
        });

        if (!device) {
            console.log(`⚠️ handleMqttAlertNotification: Device not found for ${deviceUid} — skipping notification.`);
            return;
        }

        // 2. Identify Recipient Users (Targeted ONLY to Admin who registered the device & Assigned Staff)
        const recipientUserIds = new Set();
        const recipients = [];

        // A. Find Admin who registered this specific device
        if (device.adminId) {
            const adminUser = await User.findById(device.adminId);
            if (adminUser) {
                recipientUserIds.add(adminUser._id.toString());
                recipients.push(adminUser);
            }
        }

        // B. Find Assigned Staff for this specific device
        let assignedStaffUser = null;
        if (device.assignedStaff) {
            assignedStaffUser = await User.findById(device.assignedStaff);
        }
        if (!assignedStaffUser) {
            assignedStaffUser = await User.findOne({ role: "staff", assignedDevice: device._id });
        }
        if (assignedStaffUser && !recipientUserIds.has(assignedStaffUser._id.toString())) {
            recipientUserIds.add(assignedStaffUser._id.toString());
            recipients.push(assignedStaffUser);
        }

        if (recipients.length === 0) {
            console.log(`⚠️ No registered admin or assigned staff found to notify for device ${deviceUid}`);
            return;
        }

        // 3. Compose Title & Message
        const humanAlertType = alertType.replace(/_/g, " ");
        const title = `🚨 Alert Triggered: ${humanAlertType}`;
        const locationText = device ? `Location: ${device.location || 'N/A'}, Floor: ${device.floor || 'N/A'}` : `Device: ${deviceUid}`;
        const ratingText = (alertDoc && alertDoc.rating != null) ? `Rating: ${alertDoc.rating} ★` : '';
        const descText = (alertDoc && alertDoc.description) ? alertDoc.description : `Alert [${humanAlertType}] created for device ${deviceUid}.`;
        
        const message = [ratingText, locationText, descText].filter(Boolean).join(" | ");

        // 4. Dispatch Notifications ONLY to targeted Recipients (Device Admin & Assigned Staff)
        for (const user of recipients) {
            // A. Save Notification to Database
            const dbNotification = await Notification.create({
                recipient: user._id,
                recipientRole: user.role,
                alert: alertDoc ? alertDoc._id : null,
                device_uid: deviceUid,
                device: device ? device._id : null,
                title: title,
                message: message,
                alertType: alertType,
                feedback: sensorPayload.feedback,
                type: "MQTT_ALERT"
            });

            console.log(`🔔 DB Notification saved for ${user.role.toUpperCase()} (${user.name || user.email}) [ID: ${dbNotification._id}]`);

            // B. FCM Push Notification
            let userTokens = [];
            if (user.fcmToken) userTokens.push(user.fcmToken);
            if (Array.isArray(user.fcmTokens)) userTokens.push(...user.fcmTokens);
            userTokens = Array.from(new Set(userTokens.filter(Boolean)));

            if (userTokens.length > 0) {
                await sendPushNotification({
                    tokens: userTokens,
                    title: title,
                    body: message,
                    data: {
                        notificationId: dbNotification._id.toString(),
                        alertId: alertDoc ? alertDoc._id.toString() : "",
                        device_uid: deviceUid,
                        alertType: alertType,
                        feedback: String(sensorPayload.feedback ?? "")
                    }
                });
            }

            // C. Socket.io Real-time Event Emission (Targeted strictly to user's private socket room)
            if (global.io) {
                const socketPayload = {
                    notificationId: dbNotification._id,
                    alertId: alertDoc ? alertDoc._id : null,
                    recipientId: user._id,
                    role: user.role,
                    device_uid: deviceUid,
                    title: title,
                    message: message,
                    alertType: alertType,
                    feedback: sensorPayload.feedback,
                    createdAt: dbNotification.createdAt
                };

                const alertSocketPayload = {
                    device_uid: deviceUid,
                    alert_id: alertDoc ? alertDoc._id : null,
                    type: alertType,
                    message: title,
                    feedback: sensorPayload.feedback,
                    Counter: sensorPayload.Counter,
                    OdorSensVal: sensorPayload.OdorSensVal
                };

                global.io.to(`user_${user._id}`).emit("new_alert", alertSocketPayload);
                global.io.to(`user_${user._id}`).emit("new_notification", socketPayload);
                global.io.to(`user_${user._id}`).emit("user_notification", socketPayload);
            }
        }
    } catch (error) {
        console.log("❌ handleMqttAlertNotification Error:", error.message);
    }
}

/**
 * Send notification when an alert/task is assigned to a staff member.
 */
async function sendTaskAssignedNotification(taskDoc, staffUser, adminUser, deviceDoc) {
    try {
        if (!staffUser) return;

        const title = "📋 New Task Assigned";
        const deviceUid = deviceDoc ? deviceDoc.device_uid : "N/A";
        const message = `You have been assigned a new task for device ${deviceUid} (${deviceDoc?.location || ''}).`;

        // Save DB Notification
        const dbNotification = await Notification.create({
            recipient: staffUser._id,
            recipientRole: "staff",
            alert: taskDoc ? taskDoc.alert : null,
            device_uid: deviceUid,
            device: deviceDoc ? deviceDoc._id : null,
            title: title,
            message: message,
            type: "TASK_ASSIGNED"
        });

        // Send FCM Push
        let userTokens = [];
        if (staffUser.fcmToken) userTokens.push(staffUser.fcmToken);
        if (Array.isArray(staffUser.fcmTokens)) userTokens.push(...staffUser.fcmTokens);
        userTokens = Array.from(new Set(userTokens.filter(Boolean)));

        if (userTokens.length > 0) {
            const adminUsers = await User.find({ role: "admin", $or: [{ fcmToken: { $in: userTokens } }, { fcmTokens: { $in: userTokens } }] }).select("fcmToken fcmTokens").lean();
            const adminTokensSet = new Set(adminUsers.flatMap(a => [a.fcmToken, ...(a.fcmTokens || [])].filter(Boolean)));
            userTokens = userTokens.filter(t => !adminTokensSet.has(t));
        }

        if (userTokens.length > 0) {
            await sendPushNotification({
                tokens: userTokens,
                title: title,
                body: message,
                data: {
                    taskId: taskDoc._id.toString(),
                    alertId: taskDoc.alert ? taskDoc.alert.toString() : "",
                    device_uid: deviceUid
                }
            });
        }

        // Targeted Socket emission
        if (global.io) {
            global.io.to(`user_${staffUser._id}`).emit("new_notification", dbNotification);
            global.io.to(`user_${staffUser._id}`).emit("user_notification", dbNotification);
        }
    } catch (error) {
        console.log("❌ sendTaskAssignedNotification Error:", error.message);
    }
}

/**
 * Send notification when staff submits a task.
 * Notifies ONLY the specific Admin who assigned the task or registered the device.
 */
async function sendTaskSubmittedNotification(taskDoc, staffUser, deviceDoc) {
    try {
        const title = "📋 Task Submitted for Review";
        const deviceUid = deviceDoc ? deviceDoc.device_uid : "N/A";
        const message = `Staff ${staffUser ? staffUser.name : 'Unknown'} has submitted the task for device ${deviceUid} (${deviceDoc?.location || ''}).`;

        const recipientMap = new Map();

        if (taskDoc.assignedBy) {
            const admin = await User.findById(taskDoc.assignedBy);
            if (admin) recipientMap.set(admin._id.toString(), admin);
        }
        if (deviceDoc && deviceDoc.adminId) {
            const admin = await User.findById(deviceDoc.adminId);
            if (admin) recipientMap.set(admin._id.toString(), admin);
        }
        if (recipientMap.size === 0) {
            const firstAdmin = await User.findOne({ role: "admin" });
            if (firstAdmin) recipientMap.set(firstAdmin._id.toString(), firstAdmin);
        }

        const recipients = Array.from(recipientMap.values());
        const allAdminTokens = new Set();

        for (const adminUser of recipients) {
            // Collect primary FCM token first to prevent multiple tokens for same device
            if (adminUser.fcmToken) {
                allAdminTokens.add(adminUser.fcmToken);
            } else if (Array.isArray(adminUser.fcmTokens)) {
                adminUser.fcmTokens.filter(Boolean).forEach(token => allAdminTokens.add(token));
            }

            // Save DB Notification
            const dbNotification = await Notification.create({
                recipient: adminUser._id,
                recipientRole: "admin",
                alert: taskDoc ? taskDoc.alert : null,
                device_uid: deviceUid,
                device: deviceDoc ? deviceDoc._id : null,
                title: title,
                message: message,
                type: "TASK_SUBMITTED"
            });

            // Targeted Socket emission
            if (global.io) {
                global.io.to(`user_${adminUser._id}`).emit("new_notification", dbNotification);
            }
        }

        // Send FCM Push ONCE for all targeted admin tokens (strictly deduplicated)
        const userTokens = Array.from(allAdminTokens);
        if (userTokens.length > 0) {
            await sendPushNotification({
                tokens: userTokens,
                title: title,
                body: message,
                data: {
                    taskId: taskDoc._id.toString(),
                    alertId: taskDoc.alert ? taskDoc.alert.toString() : "",
                    device_uid: deviceUid
                }
            });
        }
    } catch (error) {
        console.log("❌ sendTaskSubmittedNotification Error:", error.message);
    }
}

/**
 * Send notification when admin verifies a task.
 * Notifies ONLY the assigned staff member.
 */
async function sendTaskVerifiedNotification(taskDoc, staffUser, adminUser, deviceDoc) {
    try {
        if (!staffUser) return;

        const title = "✅ Task Verified Clean";
        const deviceUid = deviceDoc ? deviceDoc.device_uid : "N/A";
        const adminDisplayName = (adminUser && (adminUser.name || adminUser.contactPersonName)) ? (adminUser.name || adminUser.contactPersonName) : 'Admin';
        const message = `Admin ${adminDisplayName} has verified your task for device ${deviceUid} (${deviceDoc?.location || ''}).`;

        // Save DB Notification
        const dbNotification = await Notification.create({
            recipient: staffUser._id,
            recipientRole: "staff",
            alert: taskDoc ? taskDoc.alert : null,
            device_uid: deviceUid,
            device: deviceDoc ? deviceDoc._id : null,
            title: title,
            message: message,
            type: "TASK_VERIFIED"
        });

        // Send FCM Push
        let userTokens = [];
        if (staffUser.fcmToken) userTokens.push(staffUser.fcmToken);
        if (Array.isArray(staffUser.fcmTokens)) userTokens.push(...staffUser.fcmTokens);
        userTokens = Array.from(new Set(userTokens.filter(Boolean)));

        if (userTokens.length > 0) {
            const adminUsers = await User.find({ role: "admin", $or: [{ fcmToken: { $in: userTokens } }, { fcmTokens: { $in: userTokens } }] }).select("fcmToken fcmTokens").lean();
            const adminTokensSet = new Set(adminUsers.flatMap(a => [a.fcmToken, ...(a.fcmTokens || [])].filter(Boolean)));
            userTokens = userTokens.filter(t => !adminTokensSet.has(t));
        }

        if (userTokens.length > 0) {
            await sendPushNotification({
                tokens: userTokens,
                title: title,
                body: message,
                data: {
                    taskId: taskDoc._id.toString(),
                    alertId: taskDoc.alert ? taskDoc.alert.toString() : "",
                    device_uid: deviceUid
                }
            });
        }

        // Targeted Socket emission
        if (global.io) {
            global.io.to(`user_${staffUser._id}`).emit("new_notification", dbNotification);
            global.io.to(`user_${staffUser._id}`).emit("user_notification", dbNotification);
        }
    } catch (error) {
        console.log("❌ sendTaskVerifiedNotification Error:", error.message);
    }
}

/**
 * Send notification when admin rejects a task.
 * Notifies ONLY the assigned staff member.
 */
async function sendTaskRejectedNotification(taskDoc, staffUser, adminUser, deviceDoc, remarks) {
    try {
        if (!staffUser) return;

        const title = "⛔ Task Rejected by Admin";
        const deviceUid = deviceDoc ? deviceDoc.device_uid : "N/A";
        const adminDisplayName = (adminUser && (adminUser.name || adminUser.contactPersonName)) ? (adminUser.name || adminUser.contactPersonName) : 'Admin';
        const reasonText = remarks ? ` Reason: ${remarks}` : "";
        const message = `Admin ${adminDisplayName} rejected your task submission for device ${deviceUid} (${deviceDoc?.location || ''}).${reasonText}`;

        // Save DB Notification
        const dbNotification = await Notification.create({
            recipient: staffUser._id,
            recipientRole: "staff",
            alert: taskDoc ? taskDoc.alert : null,
            device_uid: deviceUid,
            device: deviceDoc ? deviceDoc._id : null,
            title: title,
            message: message,
            type: "TASK_REJECTED"
        });

        // Send FCM Push
        let userTokens = [];
        if (staffUser.fcmToken) userTokens.push(staffUser.fcmToken);
        if (Array.isArray(staffUser.fcmTokens)) userTokens.push(...staffUser.fcmTokens);
        userTokens = Array.from(new Set(userTokens.filter(Boolean)));

        if (userTokens.length > 0) {
            const adminUsers = await User.find({ role: "admin", $or: [{ fcmToken: { $in: userTokens } }, { fcmTokens: { $in: userTokens } }] }).select("fcmToken fcmTokens").lean();
            const adminTokensSet = new Set(adminUsers.flatMap(a => [a.fcmToken, ...(a.fcmTokens || [])].filter(Boolean)));
            userTokens = userTokens.filter(t => !adminTokensSet.has(t));
        }

        if (userTokens.length > 0) {
            await sendPushNotification({
                tokens: userTokens,
                title: title,
                body: message,
                data: {
                    taskId: taskDoc._id.toString(),
                    alertId: taskDoc.alert ? taskDoc.alert.toString() : "",
                    device_uid: deviceUid
                }
            });
        }

        // Targeted Socket emission
        if (global.io) {
            global.io.to(`user_${staffUser._id}`).emit("new_notification", dbNotification);
            global.io.to(`user_${staffUser._id}`).emit("user_notification", dbNotification);
        }
    } catch (error) {
        console.log("❌ sendTaskRejectedNotification Error:", error.message);
    }
}

/**
 * Send notification when an existing task is reassigned from one staff member to another.
 * Notifies BOTH the old staff member (TASK_REASSIGNED_FROM_YOU) and new staff member (TASK_REASSIGNED_TO_YOU).
 */
async function sendTaskReassignedNotification(taskDoc, oldStaffUser, newStaffUser, deviceDoc) {
    try {
        if (!oldStaffUser && !newStaffUser) return;
        const deviceUid = deviceDoc ? deviceDoc.device_uid : (taskDoc ? taskDoc.device_uid : "N/A");
        const locationText = deviceDoc?.location || deviceDoc?.locationName || 'N/A';

        // 1. Notify OLD Staff Member (if valid user object)
        if (oldStaffUser && oldStaffUser._id) {
            const oldTitle = "📋 Task Reassigned";
            const oldMessage = `Your task for device ${deviceUid} (${locationText}) has been reassigned to another staff member.`;

            // Save DB Notification
            const dbNotifOld = await Notification.create({
                recipient: oldStaffUser._id,
                recipientRole: "staff",
                alert: taskDoc ? taskDoc.alert : null,
                device_uid: deviceUid,
                device: deviceDoc ? deviceDoc._id : null,
                title: oldTitle,
                message: oldMessage,
                type: "TASK_REASSIGNED_FROM_YOU"
            });

            // Collect & Deduplicate FCM Tokens
            let oldTokens = [];
            if (oldStaffUser.fcmToken) oldTokens.push(oldStaffUser.fcmToken);
            if (Array.isArray(oldStaffUser.fcmTokens)) oldTokens.push(...oldStaffUser.fcmTokens);
            oldTokens = Array.from(new Set(oldTokens.filter(Boolean)));

            if (oldTokens.length > 0) {
                const adminUsers = await User.find({ role: "admin", $or: [{ fcmToken: { $in: oldTokens } }, { fcmTokens: { $in: oldTokens } }] }).select("fcmToken fcmTokens").lean();
                const adminTokensSet = new Set(adminUsers.flatMap(a => [a.fcmToken, ...(a.fcmTokens || [])].filter(Boolean)));
                oldTokens = oldTokens.filter(t => !adminTokensSet.has(t));
            }

            if (oldTokens.length > 0) {
                await sendPushNotification({
                    tokens: oldTokens,
                    title: oldTitle,
                    body: oldMessage,
                    data: {
                        taskId: taskDoc._id.toString(),
                        alertId: taskDoc.alert ? taskDoc.alert.toString() : "",
                        device_uid: deviceUid,
                        notificationId: dbNotifOld._id.toString(),
                        type: "TASK_REASSIGNED_FROM_YOU"
                    }
                });
            }

            // Targeted Socket.io Emission to Old Staff
            if (global.io) {
                const socketPayloadOld = {
                    ...dbNotifOld.toObject(),
                    taskId: taskDoc._id.toString(),
                    notificationId: dbNotifOld._id.toString()
                };
                global.io.to(`user_${oldStaffUser._id}`).emit("new_notification", socketPayloadOld);
                global.io.to(`user_${oldStaffUser._id}`).emit("user_notification", socketPayloadOld);
                global.io.to(`user_${oldStaffUser._id}`).emit("task_reassigned", {
                    taskId: taskDoc._id,
                    status: "REASSIGNED",
                    role: "OLD_STAFF"
                });
            }
        }

        // 2. Notify NEW Staff Member (if valid user object)
        if (newStaffUser && newStaffUser._id) {
            const newTitle = "📋 Task Reassigned to You";
            const notesSuffix = (taskDoc && (taskDoc.notes || taskDoc.adminRemarks)) ? ` Reason/Notes: ${taskDoc.notes || taskDoc.adminRemarks}` : "";
            const newMessage = `A cleaning task for device ${deviceUid} (${locationText}) has been reassigned to you.${notesSuffix}`;

            // Save DB Notification
            const dbNotifNew = await Notification.create({
                recipient: newStaffUser._id,
                recipientRole: "staff",
                alert: taskDoc ? taskDoc.alert : null,
                device_uid: deviceUid,
                device: deviceDoc ? deviceDoc._id : null,
                title: newTitle,
                message: newMessage,
                type: "TASK_REASSIGNED_TO_YOU"
            });

            // Collect & Deduplicate FCM Tokens
            let newTokens = [];
            if (newStaffUser.fcmToken) newTokens.push(newStaffUser.fcmToken);
            if (Array.isArray(newStaffUser.fcmTokens)) newTokens.push(...newStaffUser.fcmTokens);
            newTokens = Array.from(new Set(newTokens.filter(Boolean)));

            if (newTokens.length > 0) {
                const adminUsers = await User.find({ role: "admin", $or: [{ fcmToken: { $in: newTokens } }, { fcmTokens: { $in: newTokens } }] }).select("fcmToken fcmTokens").lean();
                const adminTokensSet = new Set(adminUsers.flatMap(a => [a.fcmToken, ...(a.fcmTokens || [])].filter(Boolean)));
                newTokens = newTokens.filter(t => !adminTokensSet.has(t));
            }

            if (newTokens.length > 0) {
                await sendPushNotification({
                    tokens: newTokens,
                    title: newTitle,
                    body: newMessage,
                    data: {
                        taskId: taskDoc._id.toString(),
                        alertId: taskDoc.alert ? taskDoc.alert.toString() : "",
                        device_uid: deviceUid,
                        notificationId: dbNotifNew._id.toString(),
                        type: "TASK_REASSIGNED_TO_YOU"
                    }
                });
            }

            // Targeted Socket.io Emission to New Staff
            if (global.io) {
                const socketPayloadNew = {
                    ...dbNotifNew.toObject(),
                    taskId: taskDoc._id.toString(),
                    notificationId: dbNotifNew._id.toString()
                };
                global.io.to(`user_${newStaffUser._id}`).emit("new_notification", socketPayloadNew);
                global.io.to(`user_${newStaffUser._id}`).emit("user_notification", socketPayloadNew);
                global.io.to(`user_${newStaffUser._id}`).emit("task_reassigned", {
                    taskId: taskDoc._id,
                    status: "ASSIGNED",
                    role: "NEW_STAFF"
                });
            }
        }
    } catch (error) {
        console.log("❌ sendTaskReassignedNotification Error:", error.message);
    }
}

/**
 * Automatically mark all unread notifications read for a given alertId when the alert is resolved or verified.
 */
async function markNotificationsReadForAlert(alertId) {
    if (!alertId) return;
    try {
        await Notification.updateMany({ alert: alertId, read: false }, { read: true });
        if (global.io) {
            global.io.emit("alert_notifications_cleared", { alertId: alertId.toString() });
        }
        console.log(`🧹 Marked all unread notifications read for alertId: ${alertId}`);
    } catch (error) {
        console.log("❌ markNotificationsReadForAlert Error:", error.message);
    }
}

module.exports = {
    handleMqttAlertNotification,
    sendTaskAssignedNotification,
    sendTaskSubmittedNotification,
    sendTaskVerifiedNotification,
    sendTaskRejectedNotification,
    sendTaskReassignedNotification,
    markNotificationsReadForAlert
};
