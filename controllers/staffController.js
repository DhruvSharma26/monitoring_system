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

        const verifiedOtp = await Otp.findOne({ email: normalizedEmail, verified: true });
        if (!verifiedOtp) {
            return res.status(400).json({
                success: false,
                message: "Staff email address must be verified via OTP first."
            });
        }

        if (verifiedOtp.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Verified OTP has expired. Please verify staff email again."
            });
        }

        const existingEmpId = await User.findOne({ empId });
        if (existingEmpId) {
            return res.status(400).json({
                success: false,
                message: "Employee with this Emp ID already exists"
            });
        }

        const existingEmail = await User.findOne({ email: normalizedEmail });
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: "Employee with this email address already exists"
            });
        }

        const staffCount = await User.countDocuments({ role: "staff" });
            
        if (staffCount >= 2) {
            return res.status(400).json({
                success: false,
                message: "Maximum of 2 staffs allowed"
            });
        }

        const staffId = "STF" + String(staffCount + 1).padStart(3, "0");

        const isObjectId = mongoose.Types.ObjectId.isValid(deviceId);
        const device = await Device.findOne({
            $or: isObjectId
                ? [{ _id: deviceId }, { device_uid: deviceId }, { deviceId: deviceId }]
                : [{ device_uid: deviceId }, { deviceId: deviceId }],
            adminId: req.user.id
        });

        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found or not authorized"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const staff = await User.create({
            userId: staffId,
            role: "staff",
            name,
            email: normalizedEmail,
            mobile,
            empId,
            designation,
            assignedDevice: device._id,
            password: hashedPassword,
            isVerified: true
        });

        await Otp.deleteMany({ email: normalizedEmail });

        device.assignedStaff = staff._id;
        await device.save();

        res.status(201).json({
            success: true,
            message: "Staff Registered",
            staffId
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
            assignedDevice: { $in: myDeviceIds }
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

        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Staff deleted" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    registerStaff,
    getStaff,
    deleteStaff
};