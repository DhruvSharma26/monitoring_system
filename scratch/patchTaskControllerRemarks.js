const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/controllers/taskController.js';
let content = fs.readFileSync(filePath, 'utf8');

// Patch reassignTask
const reassignTarget = `        if (notes) {
            task.notes = notes;
            task.adminRemarks = notes;
        }`;

const reassignReplacement = `        const reassignReason = notes || req.body.reason || req.body.remarks || "";
        if (reassignReason) {
            task.notes = reassignReason;
            task.adminRemarks = reassignReason;
        }`;

content = content.replace(/\r\n/g, '\n');

if (content.includes(reassignTarget)) {
    content = content.replace(reassignTarget, reassignReplacement);
}

const alertReassignTarget = `        if (task.alert) {
            const Alert = require("../models/Alert");
            await Alert.findByIdAndUpdate(task.alert, {
                status: "ASSIGNED",
                taskStatus: "ASSIGNED",
                taskProgressPercent: 0,
                taskCleaningPhotos: [],
                assignedStaff: staff._id,
                startedAt: null,
                submittedAt: null,
                photosUploadedAt: null,
                adminRemarks: notes || "",
                updatedAt: now
            });
        }`;

const alertReassignReplacement = `        if (task.alert) {
            const Alert = require("../models/Alert");
            await Alert.findByIdAndUpdate(task.alert, {
                status: "ASSIGNED",
                taskStatus: "ASSIGNED",
                taskProgressPercent: 0,
                taskCleaningPhotos: [],
                assignedStaff: staff._id,
                startedAt: null,
                submittedAt: null,
                photosUploadedAt: null,
                adminRemarks: reassignReason || task.adminRemarks || "",
                reassignNotes: reassignReason || task.notes || "",
                notes: reassignReason || task.notes || "",
                updatedAt: now
            });
        }`;

if (content.includes(alertReassignTarget)) {
    content = content.replace(alertReassignTarget, alertReassignReplacement);
}

// Patch forceVerifyTask
const forceVerifyTarget = `const forceVerifyTask = async (req, res) => {
    try {
        const taskId = req.params.taskId || req.body.taskId;
        const alertId = req.body.alertId;
        const remarks = req.body.remarks || "Force verified by admin";

        let task = taskId ? await Task.findById(taskId) : null;
        if (!task && alertId) {
            task = await Task.findOne({ alert: alertId });
        }

        const now = new Date();

        if (task) {
            task.status = "EXPIRED";
            task.adminRemarks = remarks;
            if (!Array.isArray(task.timeline)) task.timeline = [];
            task.timeline.push({
                status: "EXPIRED",
                timestamp: now,
                updatedBy: req.user ? req.user.id : null,
                notes: "Force verified by admin - task expired for staff"
            });
            await task.save();

            if (task.alert) {
                const Alert = require("../models/Alert");
                await Alert.findByIdAndUpdate(task.alert, { status: "VERIFIED", resolvedAt: now });
            }

            if (global.io) {
                global.io.emit("task_status_updated", { taskId: task._id, status: "EXPIRED" });
                global.io.emit("new_alert", { alertId: task.alert, status: "VERIFIED" });
            }
        } else if (alertId) {
            const Alert = require("../models/Alert");
            await Alert.findByIdAndUpdate(alertId, { status: "VERIFIED", resolvedAt: now });
            if (global.io) {
                global.io.emit("new_alert", { alertId: alertId, status: "VERIFIED" });
            }
        }`;

const forceVerifyReplacement = `const forceVerifyTask = async (req, res) => {
    try {
        const taskId = req.params.taskId || req.body.taskId;
        const alertId = req.body.alertId;
        const remarks = req.body.remarks || req.body.reason || req.body.notes || "Force verified by admin";

        let task = taskId ? await Task.findById(taskId) : null;
        if (!task && alertId) {
            task = await Task.findOne({ alert: alertId });
        }

        const now = new Date();

        if (task) {
            task.status = "EXPIRED";
            task.adminRemarks = remarks;
            if (!Array.isArray(task.timeline)) task.timeline = [];
            task.timeline.push({
                status: "EXPIRED",
                timestamp: now,
                updatedBy: req.user ? req.user.id : null,
                notes: \`Force verified by admin: \${remarks}\`
            });
            await task.save();

            if (task.alert) {
                const Alert = require("../models/Alert");
                await Alert.findByIdAndUpdate(task.alert, {
                    status: "VERIFIED",
                    resolvedAt: now,
                    adminRemarks: remarks,
                    remarks: remarks,
                    updatedAt: now
                });
            }

            if (global.io) {
                global.io.emit("task_status_updated", { taskId: task._id, status: "EXPIRED", adminRemarks: remarks });
                global.io.emit("new_alert", { alertId: task.alert, status: "VERIFIED", adminRemarks: remarks });
            }
        } else if (alertId) {
            const Alert = require("../models/Alert");
            await Alert.findByIdAndUpdate(alertId, {
                status: "VERIFIED",
                resolvedAt: now,
                adminRemarks: remarks,
                remarks: remarks,
                updatedAt: now
            });
            if (global.io) {
                global.io.emit("new_alert", { alertId: alertId, status: "VERIFIED", adminRemarks: remarks });
            }
        }`;

if (content.includes(forceVerifyTarget)) {
    content = content.replace(forceVerifyTarget, forceVerifyReplacement);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("SUCCESSFULLY_UPDATED_TASK_CONTROLLER_REMARKS");
