const mongoose = require("mongoose");
const User = require("../models/User");
const Device = require("../models/Device");
const Otp = require("../models/Otp");
const bcrypt = require("bcryptjs");

const registerStaff = async (req, res) => {
    try {
        const {
            name,
            email,
            mobile,
            mobile_number,
            empId,
            designation,
            deviceId,
            password
        } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email address is required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address (e.g. staff@example.com)"
            });
        }

        // Check if user already exists with this email
        const existingEmail = await User.findOne({ email: normalizedEmail });
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: "Staff member with this email address already exists"
            });
        }

        // Handle Emp ID check cleanly
        const finalEmpId = (empId && empId.trim() !== "")
            ? empId.trim()
            : ("EMP" + String(Date.now()).slice(-6));

        const existingEmpId = await User.findOne({ empId: finalEmpId });
        if (existingEmpId) {
            return res.status(400).json({
                success: false,
                message: "Staff member with this Employee ID already exists"
            });
        }

        // Generate Staff System ID (STF001, STF002...) - Uniquely Mapped
        let staffCount = await User.countDocuments({ role: "staff" });
        let staffId = "STF" + String(staffCount + 1).padStart(3, "0");
        while (await User.findOne({ userId: staffId })) {
            staffCount++;
            staffId = "STF" + String(staffCount + 1).padStart(3, "0");
        }

        // Device lookup: flexible & safe
        let device = null;
        if (deviceId && deviceId.toString().trim() !== "") {
            const isObjectId = mongoose.Types.ObjectId.isValid(deviceId);
            device = await Device.findOne({
                $or: isObjectId
                    ? [{ _id: deviceId }, { device_uid: deviceId }, { deviceId: deviceId }]
                    : [{ device_uid: deviceId }, { deviceId: deviceId }],
                adminId: req.user ? req.user.id : null
            });
            if (!device) {
                device = await Device.findOne({
                    $or: isObjectId
                        ? [{ _id: deviceId }, { device_uid: deviceId }, { deviceId: deviceId }]
                        : [{ device_uid: deviceId }, { deviceId: deviceId }]
                });
            }
        }

        if (!device && req.user && req.user.id) {
            device = await Device.findOne({ adminId: req.user.id });
        }

        if (!device) {
            device = await Device.findOne();
        }

        const rawPassword = password || "Staff@1234";
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const staff = await User.create({
            userId: staffId,
            role: "staff",
            adminId: req.user ? req.user.id : null,
            name: name || "Staff Member",
            email: normalizedEmail,
            mobile: mobile || mobile_number || "",
            empId: finalEmpId,
            designation: designation || "Cleaning Staff",
            assignedDevice: device ? device._id : null,
            password: hashedPassword,
            isVerified: true
        });

        // Clean up any pending OTPs for this email
        await Otp.deleteMany({ email: normalizedEmail });

        if (device) {
            device.assignedStaff = staff._id;
            await device.save();
        }

        res.status(201).json({
            success: true,
            message: "Staff Registered Successfully",
            staffId,
            staff
        });

    } catch (error) {
        console.log("Error registering staff:", error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Staff with this email or Employee ID already exists"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || "Server Error"
        });
    }
};

const getStaff = async (req, res) => {

    try {
        const myDevices = await Device.find({ adminId: req.user.id }).select("_id");
        const myDeviceIds = myDevices.map(d => d._id);

        const staff = await User.find({
            role: "staff",
            $or: [
                { adminId: req.user.id },
                { assignedDevice: { $in: myDeviceIds } }
            ]
        }).populate("assignedDevice");

        res.status(200).json({
            success: true,
            staff
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const deleteStaff = async (req, res) => {
    try {
        const staff = await User.findById(req.params.id);
        if (!staff || staff.role !== "staff") {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        if (staff.assignedDevice) {
            await Device.findByIdAndUpdate(staff.assignedDevice, { assignedStaff: null });
        }
        await Device.updateMany({ assignedStaff: staff._id }, { assignedStaff: null });

        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Staff deleted" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const resetStaffPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword, password } = req.body;
        const targetPassword = newPassword || password;

        if (!targetPassword || targetPassword.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "New password is required"
            });
        }

        if (targetPassword.trim().length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        const staff = await User.findById(id);
        if (!staff || staff.role !== "staff") {
            return res.status(404).json({
                success: false,
                message: "Staff member not found"
            });
        }

        // Ownership check: Admin can only reset password of staff registered under them
        let isOwnerAdmin = staff.adminId && staff.adminId.toString() === req.user.id.toString();
        if (!isOwnerAdmin && staff.assignedDevice) {
            const device = await Device.findOne({ _id: staff.assignedDevice, adminId: req.user.id });
            if (device) isOwnerAdmin = true;
        }

        if (!isOwnerAdmin) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized: You can only reset passwords for staff members registered under your account"
            });
        }

        const hashedPassword = await bcrypt.hash(targetPassword.trim(), 10);
        staff.password = hashedPassword;
        await staff.save();

        res.status(200).json({
            success: true,
            message: "Staff password reset successfully"
        });

    } catch (error) {
        console.error("Error resetting staff password:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Server Error"
        });
    }
};

module.exports = {
    registerStaff,
    getStaff,
    deleteStaff,
    resetStaffPassword
};