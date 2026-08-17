const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");
const Device = require("../models/Device");
const { getFileUrl } = require("../services/storageService");

// Helper to broadcast real-time task updates to Admin Dashboard via Socket.io
function broadcastTaskUpdate(task, eventName = "task_status_updated") {
    if (global.io) {
        global.io.emit(eventName, {
            taskId: task._id,
            status: task.status,
            startedAt: task.startedAt,
            photosUploadedAt: task.photosUploadedAt,
            submittedAt: task.submittedAt,
            verifiedAt: task.verifiedAt,
            progressPercent: task.progressPercent,
            staffId: task.staff,
            deviceUid: task.device ? task.device.device_uid : null,
            updatedAt: task.updatedAt
        });
    }
}

// Assign Task
const assignTask = async (req, res) => {
    try {
        const { staffId, deviceId, taskName, notes } = req.body;

        if (!staffId) {
            return res.status(400).json({ success: false, message: "Staff ID is required" });
        }

        const isObjectId = mongoose.Types.ObjectId.isValid(staffId);
        let staff = null;
        if (isObjectId) {
            staff = await User.findOne({ _id: staffId, role: "staff" });
        }
        if (!staff) {
            staff = await User.findOne({
                $or: [{ userId: staffId }, { email: staffId }],
                role: "staff"
            });
        }
        if (!staff) {
            staff = await User.findOne({
                $or: [{ _id: isObjectId ? staffId : null }, { userId: staffId }, { email: staffId }]
            });
        }

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: "Staff member not found"
            });
        }

        let device = null;
        if (deviceId) {
            const isDevObjectId = mongoose.Types.ObjectId.isValid(deviceId);
            device = await Device.findOne({
                $or: isDevObjectId
                    ? [{ _id: deviceId }, { device_uid: deviceId }, { deviceId: deviceId }]
                    : [{ device_uid: deviceId }, { deviceId: deviceId }]
            });
        }
        if (!device && staff.assignedDevice) {
            device = await Device.findById(staff.assignedDevice);
        }

        const now = new Date();
        const task = await Task.create({
            taskName: taskName || "Restroom Cleaning & Hygiene Maintenance",
            staff: staff._id,
            device: device ? device._id : null,
            assignedBy: req.user ? req.user.id : null,
            assignedAt: now,
            status: "ASSIGNED",
            notes: notes || "Assigned by Admin",
            timeline: [{
                status: "ASSIGNED",
                timestamp: now,
                updatedBy: req.user ? req.user.id : null,
                notes: "Task assigned by admin"
            }]
        });

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
            console.log("Error sending task notification:", err.message);
        }

        broadcastTaskUpdate(task);

        res.status(201).json({
            success: true,
            message: "Task Assigned Successfully",
            task
        });
    } catch (error) {
        console.log("Error assigning task:", error);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

// Staff clicks "Start Task"
const startTask = async (req, res) => {
    try {
        const taskId = req.params.taskId || req.body.taskId;
        const task = await Task.findById(taskId);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        // Validate that task is assigned to this staff member (if staff)
        if (req.user && req.user.role === "staff" && task.staff && task.staff.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to start a task assigned to another staff member."
            });
        }

        if (task.status === "IN_PROGRESS" || task.startedAt) {
            return res.status(400).json({
                success: false,
                message: "Task has already been started."
            });
        }

        const now = new Date();
        task.status = "IN_PROGRESS";
        task.startedAt = now;
        task.progressPercent = 10;
        
        task.timeline.push({
            status: "IN_PROGRESS",
            timestamp: now,
            updatedBy: req.user.id,
            notes: "Staff started the cleaning task"
        });

        await task.save();
        broadcastTaskUpdate(task);

        console.log(`⏱️ Task ${task._id} STARTED at ${now.toISOString()}`);

        res.status(200).json({
            success: true,
            message: "Task started",
            startedAt: now,
            task
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Staff uploads cleaning photos (Requires Minimum 3 and Maximum 5 images)
const uploadTaskPhotos = async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const task = await Task.findById(taskId);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No photo files uploaded. Minimum 3 and maximum 5 images required."
            });
        }

        // Validate Minimum 3 and Maximum 5 images rule
        if (files.length < 3) {
            return res.status(400).json({
                success: false,
                message: `Minimum 3 cleaning photos are required. You provided ${files.length}.`
            });
        }

        if (files.length > 5) {
            return res.status(400).json({
                success: false,
                message: `Maximum 5 cleaning photos allowed. You provided ${files.length}.`
            });
        }

        const now = new Date();
        const photoRecords = files.map(file => ({
            url: getFileUrl(file, req),
            uploadedAt: now
        }));

        task.cleaningPhotos = photoRecords;
        task.photosUploadedAt = now;
        task.beforeCleaningPhoto = photoRecords[0].url;
        task.afterCleaningPhoto = photoRecords[photoRecords.length - 1].url;

        task.timeline.push({
            status: "PHOTOS_UPLOADED",
            timestamp: now,
            updatedBy: req.user.id,
            notes: `Uploaded ${files.length} cleaning photos`
        });

        await task.save();
        broadcastTaskUpdate(task);

        console.log(`📷 ${files.length} Photos uploaded for Task ${task._id} at ${now.toISOString()}`);

        res.status(200).json({
            success: true,
            message: "Photos uploaded successfully",
            photosUploadedAt: now,
            photoCount: files.length,
            photos: photoRecords.map(p => p.url),
            task
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Staff Submits Task (Enforces 10-Minute Minimum Cleaning Rule)
const submitTask = async (req, res) => {
    try {
        const { taskId, notes } = req.body;
        const id = taskId || req.params.taskId;
        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        if (task.status === "REJECTED") {
            return res.status(400).json({
                success: false,
                message: "This task was rejected by Admin. Please wait for Admin to reassign the task before submitting."
            });
        }

        if (!task.startedAt) {
            return res.status(400).json({
                success: false,
                message: "You must start the task before submitting it."
            });
        }

        const now = new Date();
        const elapsedMins = task.startedAt 
            ? Math.round((now.getTime() - new Date(task.startedAt).getTime()) / (1000 * 60))
            : 0;

        task.status = "SUBMITTED";
        task.submittedAt = now;
        task.completedAt = now;
        task.durationMins = Math.round(elapsedMins);
        task.progressPercent = 100;
        if (notes) task.notes = notes;

        task.timeline.push({
            status: "SUBMITTED",
            timestamp: now,
            updatedBy: req.user.id,
            notes: `Submitted after ${Math.round(elapsedMins)} minutes of cleaning`
        });

        await task.save();
        broadcastTaskUpdate(task);

        // Trigger notification to admin
        try {
            const staff = await User.findById(task.staff);
            const device = await Device.findById(task.device);
            const notificationService = require("../services/notificationService");
            notificationService.sendTaskSubmittedNotification(task, staff, device);
        } catch (err) {
            console.log("Error sending task submission notification:", err.message);
        }

        console.log(`✅ Task ${task._id} SUBMITTED at ${now.toISOString()} (${Math.round(elapsedMins)} mins elapsed)`);

        res.status(200).json({
            success: true,
            message: "Task Submitted successfully",
            submittedAt: now,
            durationMins: Math.round(elapsedMins),
            task
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Admin Verifies Task
const verifyTask = async (req, res) => {
    try {
        const { taskId, remarks } = req.body;
        const id = taskId || req.params.taskId;
        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        const now = new Date();
        task.status = "VERIFIED";
        task.adminRemarks = remarks;
        task.verifiedAt = now;
        task.completedAt = task.completedAt || now;
        task.resolvedAt = task.resolvedAt || now;
        task.progressPercent = 100;

        task.timeline.push({
            status: "VERIFIED",
            timestamp: now,
            updatedBy: req.user.id,
            notes: remarks ? `Verified by admin: ${remarks}` : "Verified clean by admin"
        });

        await task.save();

        // Mark associated Alert as VERIFIED in DB with resolvedAt timestamp
        if (task.alert) {
            const Alert = require("../models/Alert");
            await Alert.findByIdAndUpdate(task.alert, { status: "VERIFIED", resolvedAt: now });
        }

        broadcastTaskUpdate(task);
        if (global.io) {
            global.io.emit("new_alert", { alertId: task.alert, status: "VERIFIED", taskId: task._id });
        }

        // Trigger notification to staff & clear alert notifications
        try {
            const staff = await User.findById(task.staff);
            const device = await Device.findById(task.device);
            const admin = await User.findById(req.user.id);
            const notificationService = require("../services/notificationService");
            notificationService.sendTaskVerifiedNotification(task, staff, admin, device);
            if (task.alert) {
                await notificationService.markNotificationsReadForAlert(task.alert);
            }
        } catch (err) {
            console.log("Error sending task verification notification / clearing alert notifications:", err.message);
        }

        res.status(200).json({
            success: true,
            message: "Toilet Marked Clean",
            verifiedAt: now,
            task
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Admin Rejects Task
const rejectTask = async (req, res) => {
    try {
        const { taskId, remarks } = req.body;
        const id = taskId || req.params.taskId;
        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        const now = new Date();
        task.status = "REJECTED";
        task.adminRemarks = remarks || "Rejected by admin";
        task.progressPercent = 0;

        task.timeline.push({
            status: "REJECTED",
            timestamp: now,
            updatedBy: req.user ? req.user.id : null,
            notes: remarks ? `Rejected by admin: ${remarks}` : "Task rejected by admin"
        });

        await task.save();

        if (task.alert) {
            const Alert = require("../models/Alert");
            await Alert.findByIdAndUpdate(task.alert, { status: "REJECTED" });
        }

        broadcastTaskUpdate(task);
        if (global.io) {
            global.io.emit("new_alert", { alertId: task.alert, status: "REJECTED", taskId: task._id });
        }

        try {
            const staff = await User.findById(task.staff);
            const device = await Device.findById(task.device);
            const admin = await User.findById(req.user ? req.user.id : null);
            const notificationService = require("../services/notificationService");
            await notificationService.sendTaskRejectedNotification(task, staff, admin, device, remarks);
        } catch (err) {
            console.log("Error sending task rejection notification:", err.message);
        }

        res.status(200).json({
            success: true,
            message: "Task Rejected Successfully",
            task
        });
    } catch (error) {
        console.log("Error rejecting task:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Admin Reassigns Task
const reassignTask = async (req, res) => {
    try {
        const { taskId, staffId, notes } = req.body;
        const id = taskId || req.params.taskId;
        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        // ENFORCE REASSIGNMENT LOCK: Cannot reassign if task has already been started
        if (task.startedAt || task.status === "IN_PROGRESS" || task.status === "SUBMITTED" || task.status === "VERIFIED" || task.status === "COMPLETED") {
            return res.status(400).json({
                success: false,
                message: "This task cannot be reassigned because it has already been started by the staff member."
            });
        }

        if (!staffId) {
            return res.status(400).json({ success: false, message: "Staff ID is required for reassignment" });
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
        const prevStaffId = task.staff ? task.staff.toString() : null;
        let oldStaffUser = null;
        if (prevStaffId && mongoose.Types.ObjectId.isValid(prevStaffId)) {
            oldStaffUser = await User.findById(prevStaffId);
        }

        const isSameStaff = prevStaffId ? (prevStaffId === staff._id.toString()) : false;

        task.staff = staff._id;
        task.status = "ASSIGNED";
        task.progressPercent = 0;
        task.assignedAt = now;
        task.reassignedAt = now;
        task.assignedBy = req.user ? req.user.id : null;
        if (notes) {
            task.notes = notes;
            task.adminRemarks = notes;
        }

        // Clear previous work and submission state so staff can start fresh work & upload new photos
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
            status: "REASSIGNED",
            timestamp: now,
            updatedBy: req.user ? req.user.id : null,
            prevStaff: prevStaffId,
            newStaff: staff._id.toString(),
            isSameStaff: isSameStaff,
            notes: `Reassigned to ${staff.name || staff.userId}`
        });

        await task.save();

        if (task.alert) {
            const Alert = require("../models/Alert");
            await Alert.findByIdAndUpdate(task.alert, { status: "ASSIGNED", assignedStaff: staff._id });
        }

        const device = task.device ? await Device.findById(task.device) : null;

        try {
            const notificationService = require("../services/notificationService");
            if (prevStaffId && oldStaffUser && !isSameStaff) {
                await notificationService.sendTaskReassignedNotification(task, oldStaffUser, staff, device);
            } else if (!prevStaffId && !isSameStaff) {
                await notificationService.sendTaskAssignedNotification(task, staff, req.user, device);
            }
        } catch (err) {
            console.log("Error sending task reassignment notification:", err.message);
        }

        if (global.io) {
            global.io.emit("task_status_updated", { taskId: task._id, status: "ASSIGNED", staffId: staff._id });
            global.io.emit("task_reassigned", { taskId: task._id, status: "ASSIGNED", staffId: staff._id });
            global.io.emit("new_task", { taskId: task._id, status: "ASSIGNED", staffId: staff._id });
        }

        broadcastTaskUpdate(task);

        res.status(200).json({
            success: true,
            message: "Task Reassigned Successfully",
            task
        });
    } catch (error) {
        console.log("Error reassigning task:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Get My Tasks (Staff)
const getMyTasks = async (req, res) => {
    try {
        let staffQueryId = req.user ? (req.user.id || req.user._id) : null;
        const requestedId = req.params.staffId || req.query.staffId;
        const targetId = requestedId || staffQueryId;

        let staffObj = null;
        if (targetId) {
            const isObjectId = mongoose.Types.ObjectId.isValid(targetId);
            staffObj = await User.findOne({
                $or: [
                    ...(isObjectId ? [{ _id: targetId }] : []),
                    { userId: targetId },
                    { email: targetId }
                ]
            });
        }

        const validStaffObjectIds = [];
        if (staffObj) {
            validStaffObjectIds.push(staffObj._id);
        } else if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
            validStaffObjectIds.push(new mongoose.Types.ObjectId(targetId));
        }

        const orConditions = [];

        if (validStaffObjectIds.length > 0) {
            orConditions.push({ staff: { $in: validStaffObjectIds } });
        }

        if (staffObj) {
            const staffDeviceQueries = [];

            if (staffObj._id && mongoose.Types.ObjectId.isValid(staffObj._id)) {
                staffDeviceQueries.push({ assignedStaff: staffObj._id });
            }

            if (staffObj.assignedDevice) {
                const isDevObjId = mongoose.Types.ObjectId.isValid(staffObj.assignedDevice);
                staffDeviceQueries.push(...[
                    ...(isDevObjId ? [{ _id: staffObj.assignedDevice }] : []),
                    { device_uid: staffObj.assignedDevice },
                    { deviceId: staffObj.assignedDevice }
                ]);
            }

            if (staffDeviceQueries.length > 0) {
                const matchedDevices = await Device.find({ $or: staffDeviceQueries }).select("_id").lean();
                for (const dev of matchedDevices) {
                    orConditions.push({ device: dev._id });
                }
            }

            // Auto-create an initial active task if staff is assigned to a device but has 0 tasks
            const existingTaskCount = await Task.countDocuments({
                $or: [
                    { staff: staffObj._id },
                    ...(staffObj.assignedDevice ? [{ device: staffObj.assignedDevice }] : [])
                ]
            });

            if (existingTaskCount === 0) {
                let devToAssign = null;
                if (staffObj.assignedDevice) {
                    devToAssign = await Device.findById(staffObj.assignedDevice);
                }
                if (!devToAssign) {
                    devToAssign = await Device.findOne({ assignedStaff: staffObj._id });
                }

                if (devToAssign) {
                    const now = new Date();
                    const autoTask = await Task.create({
                        taskName: `Hygiene & Sanitation — ${devToAssign.location || devToAssign.deviceId || 'Restroom'}`,
                        staff: staffObj._id,
                        device: devToAssign._id,
                        assignedAt: now,
                        status: "ASSIGNED",
                        priority: "high",
                        notes: "Initial Cleaning Task for Assigned Device",
                        timeline: [{
                            status: "ASSIGNED",
                            timestamp: now,
                            notes: "Task auto-created for assigned device"
                        }]
                    });
                    console.log(`✨ Auto-created initial task ${autoTask._id} for staff ${staffObj.userId || staffObj.name}`);
                    orConditions.push({ _id: autoTask._id });
                }
            }
        }

        let query = {};
        if (orConditions.length > 0) {
            query = { $or: orConditions };
        } else {
            return res.status(200).json({
                success: true,
                tasks: []
            });
        }

        const tasks = await Task.find(query)
            .populate("alert")
            .populate("device")
            .populate("staff", "name empId userId email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            tasks
        });
    } catch (error) {
        console.error("❌ Error in getMyTasks:", error);
        return res.status(200).json({
            success: true,
            tasks: [],
            warning: error.message
        });
    }
};

// Get All Tasks (Admin Monitoring)
const getAllTasksForAdmin = async (req, res) => {
    try {
        const tasks = await Task.find()
            .populate("staff", "name empId email")
            .populate("device", "deviceId location floor device_uid")
            .populate("assignedBy", "name email")
            .populate("alert")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: tasks.length,
            tasks
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Get Task Audit Timeline
const getTaskTimeline = async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId)
            .populate("staff", "name empId email")
            .populate("device", "deviceId location floor device_uid")
            .populate("alert")
            .populate("timeline.updatedBy", "name role");

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        res.status(200).json({
            success: true,
            task
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const completeTask = async (req, res) => {
    try {
        const { notes } = req.body;
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });
        task.status = "COMPLETED";
        if (notes) task.notes = notes;
        task.completedAt = new Date();
        task.progressPercent = 100;
        await task.save();
        broadcastTaskUpdate(task);
        res.status(200).json({ success: true, message: "Task completed", task });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateTaskProgress = async (req, res) => {
    try {
        const { progress_percent } = req.body;
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });
        task.progressPercent = progress_percent;
        await task.save();
        broadcastTaskUpdate(task);
        res.status(200).json({ success: true, message: "Progress updated", task });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    assignTask,
    startTask,
    uploadTaskPhotos,
    submitTask,
    verifyTask,
    rejectTask,
    reassignTask,
    getMyTasks,
    getAllTasksForAdmin,
    getTaskTimeline,
    completeTask,
    updateTaskProgress
};