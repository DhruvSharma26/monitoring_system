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

        const staffId =
            "STF" +
            String(staffCount + 1)
            .padStart(3, "0");

        const device =
            await Device.findById(deviceId);

        if (!device) {

            return res.status(404).json({
                success: false,
                message: "Device not found"
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

        const staff =
            await User.find({
                role: "staff"
            })
            .populate(
                "assignedDevice"
            );

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

module.exports = {
    registerStaff,
    getStaff
};