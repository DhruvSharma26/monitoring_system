const User = require("../models/User");
const Otp = require("../models/Otp");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerAdmin = async (req, res) => {

    try {

        const {
            companyName,
            country,
            contactPerson,
            designation,
            email,
            mobile,
            alternateNumber,
            password
        } = req.body;

        const verifiedOtp = await Otp.findOne({
            email,
            verified: true
        });

        if (!verifiedOtp) {

            return res.status(400).json({
                success: false,
                message: "Please verify OTP first"
            });

        }

        const existingUser = await User.findOne({
            email
        });

        if (existingUser) {

            return res.status(400).json({
                success: false,
                message: "User already exists"
            });

        }

        const adminCount = await User.countDocuments({
            role: "admin"
        });

        const adminId =
            "ADM" +
            String(adminCount + 1).padStart(3, "0");

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const admin = await User.create({

            userId: adminId,

            role: "admin",

            companyName,

            country,

            contactPerson,

            designation,

            email,

            mobile,

            alternateNumber,

            password: hashedPassword,

            isVerified: true
        });

        res.status(201).json({
            success: true,
            message: "Admin Registered",
            userId: admin.userId
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

const login = async (req, res) => {

    try {

        const {
            userId,
            password
        } = req.body;

        const user =
            await User.findOne({ userId });

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        const isMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!isMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid Password"
            });

        }

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.status(200).json({
            success: true,
            token,
            role: user.role,
            userId: user.userId
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
    registerAdmin,
    login
};