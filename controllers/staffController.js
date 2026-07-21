const User = require("../models/User");
const Device = require("../models/Device");
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

        const existingStaff =
            await User.findOne({ empId });

        if (existingStaff) {

            return res.status(400).json({
                success: false,
                message: "Employee already exists"
            });

        }

        const staffCount =
            await User.countDocuments({
                role: "staff"
            });
            
        if (staffCount >= 2) {
            return res.status(400).json({
                success: false,
                message: "Maximum of 2 staffs allowed"
            });
        }

        const staffId =
            "STF" +
            String(staffCount + 1)
            .padStart(3, "0");

        const device =
            await Device.findOne({ _id: deviceId, adminId: req.user.id });

        if (!device) {

            return res.status(404).json({
                success: false,
                message: "Device not found or not authorized"
            });

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const staff = await User.create({
    userId: staffId,
    role: "staff",
    name,
    email,
    mobile,
    empId,
    designation,
    assignedDevice: device._id,
    password: hashedPassword,
    isVerified: true
});

        device.assignedStaff = staff._id;

        await device.save();

        res.status(201).json({
            success: true,
            message: "Staff Registered",
            staffId
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
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