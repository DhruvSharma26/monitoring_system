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
        const { staffId, deviceId } = req.body;

        const staff = await User.findOne({
            $or: [{ userId: staffId }, { empId: staffId }],
            role: "staff"
        });

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: "Staff not found"
            });
        }

        const device = await Device.findById(deviceId);
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }

        const now = new Date();
        const task = await Task.create({
            staff: staff._id,
            device: device._id,
            assignedBy: req.user.id,
            assignedAt: now,
            status: "ASSIGNED",
            timeline: [{
                status: "ASSIGNED",
                timestamp: now,
                updatedBy: req.user.id,
                notes: "Task assigned by admin"
            }]
        });

        // Trigger notification to staff
        const notificationService = require("../services/notificationService");
        notificationService.sendTaskAssignedNotification(task, staff, req.user, device);

        broadcastTaskUpdate(task);

        res.status(201).json({
            success: true,
            message: "Task Assigned",
            task
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
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

        task.timeline.push({
            status: "VERIFIED",
            timestamp: now,
            updatedBy: req.user.id,
            notes: remarks ? `Verified by admin: ${remarks}` : "Verified clean by admin"
        });

        await task.save();
        broadcastTaskUpdate(task);

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

// Get My Tasks (Staff)
const getMyTasks = async (req, res) => {
    try {
        const tasks = await Task.find({ staff: req.user.id })
            .populate("device")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            tasks
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Get All Tasks (Admin Monitoring)
const getAllTasksForAdmin = async (req, res) => {
    try {
        const tasks = await Task.find()
            .populate("staff", "name empId email")
            .populate("device", "deviceId location floor device_uid")
            .populate("assignedBy", "name email")
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
    getMyTasks,
    getAllTasksForAdmin,
    getTaskTimeline,
    completeTask,
    updateTaskProgress
};