const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Device = require("../models/Device");
const User = require("../models/User");

// Assign multiple devices to a staff member
const assignDevicesToStaff = async (req, res) => {
    try {
        const staffIdInput = req.body.staffId || req.body.staff_id || req.body.staff;
        const deviceIdsInput = req.body.deviceIds || req.body.deviceId || req.body.device_id || req.body.devices;

        if (!staffIdInput) {
            return res.status(400).json({
                success: false,
                message: "Staff ID is required"
            });
        }

        let deviceIdsArray = [];
        if (Array.isArray(deviceIdsInput)) {
            deviceIdsArray = deviceIdsInput.filter(Boolean);
        } else if (typeof deviceIdsInput === "string" && deviceIdsInput.trim().length > 0) {
            deviceIdsArray = [deviceIdsInput.trim()];
        }

        if (deviceIdsArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one Device ID is required for assignment"
            });
        }

        const isObjectId = mongoose.Types.ObjectId.isValid(staffIdInput);
        const staff = await User.findOne({
            $or: [
                ...(isObjectId ? [{ _id: staffIdInput }] : []),
                { userId: staffIdInput },
                { email: staffIdInput },
                { empId: staffIdInput }
            ]
        });

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: `Staff member not found for specified ID '${staffIdInput}'`
            });
        }

        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const now = new Date();
        const createdAssignments = [];

        for (const devIdInput of deviceIdsArray) {
            const devClean = String(devIdInput).trim();
            const isDevObjId = mongoose.Types.ObjectId.isValid(devClean);
            const device = await Device.findOne({
                $or: [
                    ...(isDevObjId ? [{ _id: devClean }] : []),
                    { deviceId: devClean },
                    { device_uid: devClean },
                    { deviceId: { $regex: new RegExp(`^${devClean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } },
                    { device_uid: { $regex: new RegExp(`^${devClean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } }
                ]
            });

            if (!device) continue;

            // Deactivate any existing active assignment for this device
            await Assignment.updateMany(
                { device: device._id, status: "ACTIVE" },
                { $set: { status: "INACTIVE", unassignedAt: now } }
            );

            // Create new active assignment
            const newAssignment = await Assignment.create({
                staff: staff._id,
                device: device._id,
                adminId: adminId,
                status: "ACTIVE",
                assignedAt: now
            });

            const oldStaffId = device.assignedStaff ? device.assignedStaff.toString() : null;
            // Update Device's assignedStaff pointer
            device.assignedStaff = staff._id;
            await device.save();

            // Reassign open tasks for this device if staff changed
            if (oldStaffId && oldStaffId !== staff._id.toString()) {
                try {
                    const Task = require("../models/Task");
                    const notificationService = require("../services/notificationService");
                    const oldStaffUser = await User.findById(oldStaffId);
                    const openTasks = await Task.find({ device: device._id, status: "ASSIGNED", startedAt: { $exists: false } });

                    for (const openTask of openTasks) {
                        if (openTask.staff && !openTask.startedAt && openTask.staff.toString() !== staff._id.toString()) {
                            const taskOldStaffId = openTask.staff.toString();
                            const taskOldStaffUser = taskOldStaffId === oldStaffId ? oldStaffUser : await User.findById(taskOldStaffId);

                            openTask.staff = staff._id;
                            openTask.reassignedAt = now;
                            openTask.timeline.push({
                                status: "REASSIGNED",
                                timestamp: now,
                                prevStaff: taskOldStaffId,
                                newStaff: staff._id.toString(),
                                notes: `Reassigned due to device assignment change to ${staff.name || staff.userId}`
                            });
                            await openTask.save();

                            if (taskOldStaffUser && staff) {
                                await notificationService.sendTaskReassignedNotification(openTask, taskOldStaffUser, staff, device);
                            }
                        }
                    }
                } catch (tErr) {
                    console.log("Error reassigning open tasks during device assignment:", tErr.message);
                }
            }

            createdAssignments.push(newAssignment);
        }

        if (global.io) {
            global.io.emit("assignments_updated", { staffId: staff._id, count: createdAssignments.length });
        }

        return res.status(200).json({
            success: true,
            message: `Successfully assigned ${createdAssignments.length} device(s) to staff ${staff.name || staff.userId || staff.empId}`,
            count: createdAssignments.length,
            assignments: createdAssignments
        });
    } catch (error) {
        console.error("Error in assignDevicesToStaff:", error);
        return res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

// Get all assignments grouped by staff
const getAllAssignments = async (req, res) => {
    try {
        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const isObjectId = mongoose.Types.ObjectId.isValid(adminId);

        let myDevices = [];
        if (adminId) {
            myDevices = await Device.find({
                $or: [
                    { adminId: adminId },
                    ...(isObjectId ? [{ adminId: new mongoose.Types.ObjectId(adminId) }] : [])
                ]
            }).select("_id deviceId device_uid locationName location floor status");

            if (myDevices.length === 0) {
                myDevices = await Device.find().select("_id deviceId device_uid locationName location floor status");
            }
        } else {
            myDevices = await Device.find().select("_id deviceId device_uid locationName location floor status");
        }
        
        const myDeviceIds = myDevices.map(d => d._id);

        let adminStaff = [];
        if (adminId) {
            adminStaff = await User.find({
                role: { $regex: /^staff$/i },
                $or: [
                    { adminId: adminId },
                    { admin_id: adminId },
                    { admin: adminId },
                    { created_by: adminId },
                    ...(isObjectId ? [
                        { adminId: new mongoose.Types.ObjectId(adminId) },
                        { admin_id: new mongoose.Types.ObjectId(adminId) },
                        { admin: new mongoose.Types.ObjectId(adminId) }
                    ] : []),
                    { assignedDevice: { $in: myDeviceIds } }
                ]
            }).select("name empId userId email mobile designation").lean();
        }

        if (!adminStaff || adminStaff.length === 0) {
            adminStaff = await User.find({ role: { $regex: /^staff$/i } }).select("name empId userId email mobile designation").lean();
        }

        const activeAssignments = await Assignment.find({
            device: { $in: myDeviceIds },
            status: "ACTIVE"
        })
            .populate("staff", "name empId userId email mobile designation")
            .populate("device", "deviceId device_uid locationName location floor status")
            .sort({ assignedAt: -1 });

        const staffMap = new Map();

        for (const s of adminStaff) {
            if (!s || !s._id) continue;
            staffMap.set(s._id.toString(), {
                staff: s,
                assignedDevices: [],
                deviceCount: 0,
                lastAssignedAt: null
            });
        }

        for (const asgn of activeAssignments) {
            if (!asgn.staff || !asgn.device) continue;
            const staffIdStr = asgn.staff._id.toString();
            
            if (staffMap.has(staffIdStr)) {
                const item = staffMap.get(staffIdStr);
                item.assignedDevices.push({
                    assignmentId: asgn._id,
                    device: asgn.device,
                    assignedAt: asgn.assignedAt
                });
                item.deviceCount = item.assignedDevices.length;
                if (!item.lastAssignedAt || asgn.assignedAt > item.lastAssignedAt) {
                    item.lastAssignedAt = asgn.assignedAt;
                }
            }
        }

        const result = Array.from(staffMap.values());

        return res.status(200).json({
            success: true,
            count: result.length,
            assignments: result
        });
    } catch (error) {
        console.error("Error in getAllAssignments:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Get devices assigned to a specific staff
const getStaffAssignments = async (req, res) => {
    try {
        const staffIdParam = req.params.staffId;
        const isObjectId = mongoose.Types.ObjectId.isValid(staffIdParam);
        const staff = await User.findOne({
            $or: [
                ...(isObjectId ? [{ _id: staffIdParam }] : []),
                { userId: staffIdParam },
                { email: staffIdParam },
                { empId: staffIdParam }
            ]
        });

        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff member not found" });
        }

        const assignments = await Assignment.find({ staff: staff._id, status: "ACTIVE" })
            .populate("device")
            .sort({ assignedAt: -1 });

        return res.status(200).json({
            success: true,
            staff: { _id: staff._id, name: staff.name, userId: staff.userId, empId: staff.empId },
            count: assignments.length,
            assignedDevices: assignments.map(a => a.device)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Unassign a device from staff
const unassignDevice = async (req, res) => {
    try {
        const targetDeviceId = req.body.deviceId || req.body.device_id || req.params.deviceId;

        if (!targetDeviceId) {
            return res.status(400).json({ success: false, message: "Device ID is required" });
        }

        const devClean = String(targetDeviceId).trim();
        const isDevObjId = mongoose.Types.ObjectId.isValid(devClean);
        const device = await Device.findOne({
            $or: [
                ...(isDevObjId ? [{ _id: devClean }] : []),
                { deviceId: devClean },
                { device_uid: devClean },
                { deviceId: { $regex: new RegExp(`^${devClean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } },
                { device_uid: { $regex: new RegExp(`^${devClean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } }
            ]
        });

        if (!device) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        const now = new Date();
        await Assignment.updateMany(
            { device: device._id, status: "ACTIVE" },
            { $set: { status: "INACTIVE", unassignedAt: now } }
        );

        device.assignedStaff = null;
        await device.save();

        if (global.io) {
            global.io.emit("assignments_updated", { deviceId: device._id });
        }

        return res.status(200).json({
            success: true,
            message: "Device unassigned successfully",
            device
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Reassign a device to a new staff member
const reassignDevice = async (req, res) => {
    try {
        const deviceIdInput = req.body.deviceId || req.body.device_id;
        const newStaffIdInput = req.body.newStaffId || req.body.staffId || req.body.staff_id;

        if (!deviceIdInput || !newStaffIdInput) {
            return res.status(400).json({ success: false, message: "Device ID and new Staff ID are required" });
        }

        const devClean = String(deviceIdInput).trim();
        const isDevObjId = mongoose.Types.ObjectId.isValid(devClean);
        const device = await Device.findOne({
            $or: [
                ...(isDevObjId ? [{ _id: devClean }] : []),
                { deviceId: devClean },
                { device_uid: devClean },
                { deviceId: { $regex: new RegExp(`^${devClean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } },
                { device_uid: { $regex: new RegExp(`^${devClean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } }
            ]
        });

        if (!device) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        const isStaffObjId = mongoose.Types.ObjectId.isValid(newStaffIdInput);
        const newStaff = await User.findOne({
            $or: [
                ...(isStaffObjId ? [{ _id: newStaffIdInput }] : []),
                { userId: newStaffIdInput },
                { email: newStaffIdInput },
                { empId: newStaffIdInput }
            ]
        });

        if (!newStaff) {
            return res.status(404).json({ success: false, message: "New Staff member not found" });
        }

        const now = new Date();
        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const oldStaffId = device.assignedStaff ? device.assignedStaff.toString() : null;

        // Deactivate current active assignments
        await Assignment.updateMany(
            { device: device._id, status: "ACTIVE" },
            { $set: { status: "INACTIVE", unassignedAt: now } }
        );

        // Create new assignment
        const newAssignment = await Assignment.create({
            staff: newStaff._id,
            device: device._id,
            adminId: adminId,
            status: "ACTIVE",
            assignedAt: now
        });

        device.assignedStaff = newStaff._id;
        await device.save();

        // Reassign any open tasks for this device if assigned staff changed
        if (oldStaffId && oldStaffId !== newStaff._id.toString()) {
            try {
                const Task = require("../models/Task");
                const notificationService = require("../services/notificationService");
                const oldStaffUser = await User.findById(oldStaffId);
                const openTasks = await Task.find({ device: device._id, status: "ASSIGNED", startedAt: { $exists: false } });

                for (const openTask of openTasks) {
                    if (openTask.staff && !openTask.startedAt && openTask.staff.toString() !== newStaff._id.toString()) {
                        const taskOldStaffId = openTask.staff.toString();
                        const taskOldStaffUser = taskOldStaffId === oldStaffId ? oldStaffUser : await User.findById(taskOldStaffId);

                        openTask.staff = newStaff._id;
                        openTask.reassignedAt = now;
                        openTask.timeline.push({
                            status: "REASSIGNED",
                            timestamp: now,
                            prevStaff: taskOldStaffId,
                            newStaff: newStaff._id.toString(),
                            notes: `Reassigned due to device reassignment to ${newStaff.name || newStaff.userId}`
                        });
                        await openTask.save();

                        if (taskOldStaffUser && newStaff) {
                            await notificationService.sendTaskReassignedNotification(openTask, taskOldStaffUser, newStaff, device);
                        }
                    }
                }
            } catch (tErr) {
                console.log("Error reassigning open tasks during device reassignment:", tErr.message);
            }
        }

        if (global.io) {
            global.io.emit("assignments_updated", { deviceId: device._id, newStaffId: newStaff._id });
        }

        return res.status(200).json({
            success: true,
            message: `Device reassigned to ${newStaff.name || newStaff.userId || newStaff.empId}`,
            assignment: newAssignment
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    assignDevicesToStaff,
    getAllAssignments,
    getStaffAssignments,
    unassignDevice,
    reassignDevice
};
