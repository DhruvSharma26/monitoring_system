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

            // Update Device's assignedStaff pointer
            device.assignedStaff = staff._id;
            await device.save();

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
        const activeAssignments = await Assignment.find({ status: "ACTIVE" })
            .populate("staff", "name empId userId email mobile designation")
            .populate("device", "deviceId device_uid locationName location floor status")
            .sort({ assignedAt: -1 });

        const staffMap = new Map();

        // Get all staff users
        let allStaff = await User.find({ role: { $regex: /^staff$/i } }).select("name empId userId email mobile designation").lean();
        if (!allStaff || allStaff.length === 0) {
            allStaff = await User.find({ role: { $ne: "admin" } }).select("name empId userId email mobile designation").lean();
        }

        for (const s of allStaff) {
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
            
            if (!staffMap.has(staffIdStr)) {
                staffMap.set(staffIdStr, {
                    staff: asgn.staff,
                    assignedDevices: [],
                    deviceCount: 0,
                    lastAssignedAt: asgn.assignedAt
                });
            }

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
