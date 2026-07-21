const Task = require("../models/Task");
const User = require("../models/User");
const Device = require("../models/Device");

const assignTask = async (req, res) => {

    try {

        const {
            staffId,
            deviceId
        } = req.body;

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

        const device =
            await Device.findById(
                deviceId
            );

        if (!device) {

            return res.status(404).json({
                success: false,
                message: "Device not found"
            });

        }

        const task =
            await Task.create({

                staff: staff._id,

                device: device._id,

                assignedBy:
                req.user.id,

                status:
                "ASSIGNED"

            });

        res.status(201).json({
            success: true,
            message:
            "Task Assigned",
            task
        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:"Server Error"
        });

    }

};

const getMyTasks = async (req, res) => {

    try {

        const tasks =
            await Task.find({
                staff:
                req.user.id
            })
            .populate("device");

        res.status(200).json({
            success: true,
            tasks
        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:"Server Error"
        });

    }

};

const submitTask = async (req, res) => {

    try {

        const {
            taskId,
            beforeCleaningPhoto,
            afterCleaningPhoto
        } = req.body;

        const task = await Task.findById(taskId);

        if (!task) {

            return res.status(404).json({
                success: false,
                message: "Task not found"
            });

        }

        if (
            task.staff.toString() !==
            req.user.id
        ) {

            return res.status(403).json({
                success: false,
                message: "Unauthorized"
            });

        }

        task.beforeCleaningPhoto =
            beforeCleaningPhoto;

        task.afterCleaningPhoto =
            afterCleaningPhoto;

        task.status =
            "SUBMITTED";

        await task.save();

        res.status(200).json({
            success: true,
            message: "Task Submitted"
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const verifyTask = async (req, res) => {

    try {

        const {
            taskId,
            remarks
        } = req.body;

        const task =
            await Task.findById(
                taskId
            );

        if (!task) {

            return res.status(404).json({
                success:false,
                message:"Task not found"
            });

        }

        task.status =
            "VERIFIED";

        task.adminRemarks =
            remarks;

        task.verifiedAt =
            new Date();

        await task.save();

        res.status(200).json({
            success:true,
            message:
            "Toilet Marked Clean"
        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:"Server Error"
        });

    }

};

const startTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });
        task.status = "IN_PROGRESS";
        await task.save();
        res.status(200).json({ success: true, message: "Task started", task });
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
        res.status(200).json({ success: true, message: "Progress updated", task });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {

    assignTask,

    getMyTasks,

    submitTask,

    verifyTask,
    
    startTask,
    
    completeTask,
    
    updateTaskProgress

};