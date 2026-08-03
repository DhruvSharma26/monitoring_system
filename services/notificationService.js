const Notification = require("../models/Notification");
const User = require("../models/User");
const Device = require("../models/Device");
const nodemailer = require("nodemailer");
const { sendPushNotification } = require("../config/firebase");

// Create reusable nodemailer transporter
function getMailTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

/**
 * Handle notification dispatch when an alert is created from MQTT feedback/sensor data.
 * Notifies Admin(s) and Assigned Staff via FCM Push, MongoDB Notification, Socket.io, and Email.
 */
async function handleMqttAlertNotification(sensorPayload, alertType, alertDoc) {
    try {
        const deviceUid = sensorPayload.device_uid;

        // 1. Locate Device details
        const device = await Device.findOne({ device_uid: deviceUid });

        // 2. Identify Recipient Users
        const recipientUserIds = new Set();
        const recipients = [];

        // A. Find Assigned Staff
        let assignedStaffUser = null;
        if (device && device.assignedStaff) {
            assignedStaffUser = await User.findById(device.assignedStaff);
        }
        if (!assignedStaffUser && device) {
            assignedStaffUser = await User.findOne({ role: "staff", assignedDevice: device._id });
        }
        if (assignedStaffUser) {
            recipientUserIds.add(assignedStaffUser._id.toString());
            recipients.push(assignedStaffUser);
        }

        // B. Find Admin(s)
        if (device && device.adminId) {
            const adminUser = await User.findById(device.adminId);
            if (adminUser && !recipientUserIds.has(adminUser._id.toString())) {
                recipientUserIds.add(adminUser._id.toString());
                recipients.push(adminUser);
            }
        }

        // Fallback: If no specific admin was attached to device, notify all Admin users
        const allAdmins = await User.find({ role: "admin" });
        for (const adminUser of allAdmins) {
            if (!recipientUserIds.has(adminUser._id.toString())) {
                recipientUserIds.add(adminUser._id.toString());
                recipients.push(adminUser);
            }
        }

        if (recipients.length === 0) {
            console.log(`⚠️ No admin or assigned staff found to notify for device ${deviceUid}`);
            return;
        }

        // 3. Compose Title & Message
        const humanAlertType = alertType.replace(/_/g, " ");
        const title = `🚨 Alert Triggered: ${humanAlertType}`;
        const locationText = device ? `Location: ${device.location || 'N/A'}, Floor: ${device.floor || 'N/A'}` : `Device: ${deviceUid}`;
        const feedbackText = sensorPayload.feedback !== undefined ? `Feedback Rating: ${sensorPayload.feedback}` : '';
        const odorText = sensorPayload.OdorSensVal !== undefined ? `Odor Level: ${sensorPayload.OdorSensVal}` : '';
        const counterText = sensorPayload.Counter !== undefined ? `Counter: ${sensorPayload.Counter}` : '';
        
        const details = [locationText, feedbackText, odorText, counterText].filter(Boolean).join(" | ");
        const message = `Alert [${humanAlertType}] created for device ${deviceUid}. (${details})`;

        const transporter = getMailTransporter();

        // 4. Dispatch Notifications to each Recipient (Admin & Staff)
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
            const userTokens = [];
            if (user.fcmToken) userTokens.push(user.fcmToken);
            if (Array.isArray(user.fcmTokens)) userTokens.push(...user.fcmTokens);

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

            // C. Socket.io Real-time Event Emission
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

                // Broadcast globally & emit to user specific room
                global.io.emit("new_notification", socketPayload);
                global.io.to(`user_${user._id}`).emit("user_notification", socketPayload);
            }

            // D. Email Notification
            if (transporter && user.email) {
                transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: `${title} (${deviceUid})`,
                    text: `${message}\n\nPlease check your app for full details.`
                }).catch(err => {
                    console.log(`⚠️ Email dispatch error to ${user.email}:`, err.message);
                });
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
            device_uid: deviceUid,
            device: deviceDoc ? deviceDoc._id : null,
            title: title,
            message: message,
            type: "TASK_ASSIGNED"
        });

        // Send FCM Push
        const userTokens = [];
        if (staffUser.fcmToken) userTokens.push(staffUser.fcmToken);
        if (Array.isArray(staffUser.fcmTokens)) userTokens.push(...staffUser.fcmTokens);

        if (userTokens.length > 0) {
            await sendPushNotification({
                tokens: userTokens,
                title: title,
                body: message,
                data: {
                    taskId: taskDoc._id.toString(),
                    device_uid: deviceUid
                }
            });
        }

        // Socket emission
        if (global.io) {
            global.io.emit("new_notification", dbNotification);
            global.io.to(`user_${staffUser._id}`).emit("user_notification", dbNotification);
        }
    } catch (error) {
        console.log("❌ sendTaskAssignedNotification Error:", error.message);
    }
}

async function sendTaskSubmittedNotification(taskDoc, staffUser, deviceDoc) {
    try {
        const title = "📋 Task Submitted for Review";
        const deviceUid = deviceDoc ? deviceDoc.device_uid : "N/A";
        const message = `Staff ${staffUser ? staffUser.name : 'Unknown'} has submitted the task for device ${deviceUid} (${deviceDoc?.location || ''}).`;

        const recipients = [];
        if (taskDoc.assignedBy) {
            const admin = await User.findById(taskDoc.assignedBy);
            if (admin) recipients.push(admin);
        }
        if (recipients.length === 0) {
            const allAdmins = await User.find({ role: "admin" });
            recipients.push(...allAdmins);
        }

        for (const adminUser of recipients) {
            // Save DB Notification
            const dbNotification = await Notification.create({
                recipient: adminUser._id,
                recipientRole: "admin",
                device_uid: deviceUid,
                device: deviceDoc ? deviceDoc._id : null,
                title: title,
                message: message,
                type: "TASK_SUBMITTED"
            });

            // Send FCM Push
            const userTokens = [];
            if (adminUser.fcmToken) userTokens.push(adminUser.fcmToken);
            if (Array.isArray(adminUser.fcmTokens)) userTokens.push(...adminUser.fcmTokens);

            if (userTokens.length > 0) {
                await sendPushNotification({
                    tokens: userTokens,
                    title: title,
                    body: message,
                    data: {
                        taskId: taskDoc._id.toString(),
                        device_uid: deviceUid
                    }
                });
            }

            // Socket emission
            if (global.io) {
                global.io.emit("new_notification", dbNotification);
                global.io.to(`user_${adminUser._id}`).emit("user_notification", dbNotification);
            }
        }
    } catch (error) {
        console.log("❌ sendTaskSubmittedNotification Error:", error.message);
    }
}

async function sendTaskVerifiedNotification(taskDoc, staffUser, adminUser, deviceDoc) {
    try {
        if (!staffUser) return;

        const title = "✅ Task Verified Clean";
        const deviceUid = deviceDoc ? deviceDoc.device_uid : "N/A";
        const message = `Admin ${adminUser ? adminUser.name : 'Admin'} has verified your task for device ${deviceUid} (${deviceDoc?.location || ''}).`;

        // Save DB Notification
        const dbNotification = await Notification.create({
            recipient: staffUser._id,
            recipientRole: "staff",
            device_uid: deviceUid,
            device: deviceDoc ? deviceDoc._id : null,
            title: title,
            message: message,
            type: "TASK_VERIFIED"
        });

        // Send FCM Push
        const userTokens = [];
        if (staffUser.fcmToken) userTokens.push(staffUser.fcmToken);
        if (Array.isArray(staffUser.fcmTokens)) userTokens.push(...staffUser.fcmTokens);

        if (userTokens.length > 0) {
            await sendPushNotification({
                tokens: userTokens,
                title: title,
                body: message,
                data: {
                    taskId: taskDoc._id.toString(),
                    device_uid: deviceUid
                }
            });
        }

        // Socket emission
        if (global.io) {
            global.io.emit("new_notification", dbNotification);
            global.io.to(`user_${staffUser._id}`).emit("user_notification", dbNotification);
        }
    } catch (error) {
        console.log("❌ sendTaskVerifiedNotification Error:", error.message);
    }
}

module.exports = {
    handleMqttAlertNotification,
    sendTaskAssignedNotification,
    sendTaskSubmittedNotification,
    sendTaskVerifiedNotification
};
