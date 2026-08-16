const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Device = require("../models/Device");
const User = require("../models/User");

// Assign multiple devices to a staff member
const assignDevicesToStaff = async (req, res) => {
    try {
        const { staffId, deviceIds } = req.body;

        if (!staffId || !deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Staff ID and array of Device IDs are required"
            });
        }

        const isObjectId = mongoose.Types.ObjectId.isValid(staffId);
        const staff = await User.findOne({
            $or: [
                ...(isObjectId ? [{ _id: staffId }] : []),
                { userId: staffId },
                { email: staffId },
                { empId: staffId }
            ],
            role: "staff"
        });

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: "Staff member not found"
            });
        }

        const adminId = req.user ? (req.user.id || req.user._id) : null;
        const now = new Date();
        const createdAssignments = [];

        for (const devIdInput of deviceIds) {
            const isDevObjId = mongoose.Types.ObjectId.isValid(devIdInput);
            const device = await Device.findOne({
                $or: [
                    ...(isDevObjId ? [{ _id: devIdInput }] : []),
                    { deviceId: devIdInput },
                    { device_uid: devIdInput }
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
            message: `Successfully assigned ${createdAssignments.length} device(s) to staff ${staff.name || staff.userId}`,
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
        const allStaff = await User.find({ role: "staff" }).select("name empId userId email mobile designation").lean();
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
                { email: staffIdParam }
            ]
        });

        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
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
        const { deviceId } = req.body;
        const targetDeviceId = deviceId || req.params.deviceId;

        if (!targetDeviceId) {
            return res.status(400).json({ success: false, message: "Device ID is required" });
        }

        const isDevObjId = mongoose.Types.ObjectId.isValid(targetDeviceId);
        const device = await Device.findOne({
            $or: [
                ...(isDevObjId ? [{ _id: targetDeviceId }] : []),
                { deviceId: targetDeviceId },
                { device_uid: targetDeviceId }
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
        const { deviceId, newStaffId } = req.body;

        if (!deviceId || !newStaffId) {
            return res.status(400).json({ success: false, message: "Device ID and new Staff ID are required" });
        }

        const isDevObjId = mongoose.Types.ObjectId.isValid(deviceId);
        const device = await Device.findOne({
            $or: [
                ...(isDevObjId ? [{ _id: deviceId }] : []),
                { deviceId: deviceId },
                { device_uid: deviceId }
            ]
        });

        if (!device) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        const isStaffObjId = mongoose.Types.ObjectId.isValid(newStaffId);
        const newStaff = await User.findOne({
            $or: [
                ...(isStaffObjId ? [{ _id: newStaffId }] : []),
                { userId: newStaffId },
                { email: newStaffId }
            ],
            role: "staff"
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
            message: `Device reassigned to ${newStaff.name || newStaff.userId}`,
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
