const mongoose = require("mongoose");
const User = require("../models/User");
const Device = require("../models/Device");
const Otp = require("../models/Otp");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");

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

        let staff = await User.find({
            role: { $regex: /^staff$/i },
            $or: [
                { adminId: req.user.id },
                { assignedDevice: { $in: myDeviceIds } }
            ]
        }).populate("assignedDevice");

        if (!staff || staff.length === 0) {
            staff = await User.find({ role: { $regex: /^staff$/i } }).populate("assignedDevice");
        }

        if (!staff || staff.length === 0) {
            staff = await User.find({ role: { $ne: "admin" } }).populate("assignedDevice");
        }

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

const sendStaffResetOtp = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await User.findById(id);
        if (!staff || staff.role !== "staff") {
            return res.status(404).json({
                success: false,
                message: "Staff member not found"
            });
        }

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

        if (!staff.email) {
            return res.status(400).json({
                success: false,
                message: "Staff member does not have an email address registered"
            });
        }

        const normalizedEmail = staff.email.toLowerCase().trim();
        const otp = crypto.randomInt(100000, 999999).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000);

        await Otp.deleteMany({ email: normalizedEmail });
        await Otp.create({
            email: normalizedEmail,
            otp,
            expiresAt: expiry
        });

        console.log(`📧 [STAFF RESET OTP GENERATED] OTP ${otp} generated for staff ${staff.name} (${normalizedEmail})`);

        await sendEmail({
            to: normalizedEmail,
            subject: "Sinexus - Staff Password Reset OTP",
            text: `Hello ${staff.name}, Your OTP for password reset requested by Admin is: ${otp}. Valid for 5 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #1565C0;">Sinexus Staff Password Reset</h2>
                    <p>Hello <strong>${staff.name}</strong>,</p>
                    <p>Your Admin has initiated a password reset for your account. Use the OTP code below to verify:</p>
                    <div style="font-size: 26px; font-weight: bold; letter-spacing: 4px; color: #1565C0; background: #f0f4f8; padding: 12px 24px; display: inline-block; border-radius: 8px; margin: 10px 0;">
                        ${otp}
                    </div>
                    <p style="margin-top: 20px; font-size: 12px; color: #777;">This OTP will expire in 5 minutes.</p>
                </div>
            `
        });

        res.status(200).json({
            success: true,
            message: `OTP sent successfully to staff email: ${normalizedEmail}`
        });
    } catch (error) {
        console.error("Error sending staff reset OTP:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Server Error"
        });
    }
};

const verifyStaffResetOtp = async (req, res) => {
    try {
        const { id } = req.params;
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({
                success: false,
                message: "OTP code is required"
            });
        }

        const staff = await User.findById(id);
        if (!staff || staff.role !== "staff") {
            return res.status(404).json({
                success: false,
                message: "Staff member not found"
            });
        }

        const normalizedEmail = staff.email.toLowerCase().trim();
        const trimmedOtp = otp.toString().trim();

        const otpRecord = await Otp.findOne({
            email: normalizedEmail,
            otp: trimmedOtp
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP code"
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP code expired. Please request a new OTP."
            });
        }

        otpRecord.verified = true;
        await otpRecord.save();

        res.status(200).json({
            success: true,
            message: "OTP verified successfully"
        });
    } catch (error) {
        console.error("Error verifying staff reset OTP:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Server Error"
        });
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

        // Check if OTP was verified for this staff's email
        const normalizedEmail = staff.email.toLowerCase().trim();
        const otpRecord = await Otp.findOne({
            email: normalizedEmail,
            verified: true
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Staff email OTP verification is required before resetting password"
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP expired. Please send and verify a new OTP."
            });
        }

        const hashedPassword = await bcrypt.hash(targetPassword.trim(), 10);
        staff.password = hashedPassword;
        await staff.save();

        await Otp.deleteMany({ email: normalizedEmail });

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

const updateStaffGalleryAccess = async (req, res) => {
    try {
        const { email, allowGalleryUpload } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Staff email address is required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const staff = await User.findOne({ email: normalizedEmail, role: "staff" });

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: "Staff member with this email address not found"
            });
        }

        // Verify ownership (or match adminId)
        let isOwnerAdmin = staff.adminId && staff.adminId.toString() === req.user.id.toString();
        if (!isOwnerAdmin && staff.assignedDevice) {
            const device = await Device.findOne({ _id: staff.assignedDevice, adminId: req.user.id });
            if (device) isOwnerAdmin = true;
        }

        if (!isOwnerAdmin) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized: You can only modify settings for staff registered under your account"
            });
        }

        staff.allowGalleryUpload = Boolean(allowGalleryUpload);
        await staff.save();

        res.status(200).json({
            success: true,
            message: `Gallery upload access ${staff.allowGalleryUpload ? 'enabled' : 'disabled'} for ${staff.email}`,
            staff
        });

    } catch (error) {
        console.error("Error updating staff gallery access:", error);
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
    sendStaffResetOtp,
    verifyStaffResetOtp,
    resetStaffPassword,
    updateStaffGalleryAccess
};