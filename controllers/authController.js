const User = require("../models/User");
const Otp = require("../models/Otp");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerAdmin = async (req, res, next) => {

    try {

        const {
            userId,
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

        const existingId = await User.findOne({
            userId
        });

        if (existingId) {

            return res.status(400).json({
                success: false,
                message: "User ID already exists"
            });

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const admin = await User.create({

            userId,

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
        next(error);
    }
};

const login = async (req, res, next) => {

    try {

        const {
            email,
            userId,
            identifier,
            password
        } = req.body;
        
        // Determine the search criteria based on what is provided
        let query = {};
        if (identifier) {
            query = { $or: [{ email: identifier }, { userId: identifier }] };
        } else if (email) {
            query = { email };
        } else if (userId) {
            query = { userId };
        } else {
            return res.status(400).json({
                success: false,
                message: "Please provide email, userId, or identifier"
            });
        }

        const user =
            await User.findOne(query);

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
                expiresIn: "15m"
            }
        );

        const refreshToken = jwt.sign(
            { id: user._id },
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        user.refreshToken = refreshToken;
        await user.save();

        res.status(200).json({
            success: true,
            token,
            refreshToken,
            role: user.role,
            userId: user.userId
        });

    } catch (error) {
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ success: false, message: "No refresh token provided" });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({ success: false, message: "Invalid refresh token" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        res.status(200).json({ success: true, token });
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
        }
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const userId = req.user.id;
        await User.findByIdAndUpdate(userId, { refreshToken: null });
        res.status(200).json({ success: true, message: "Logged out" });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerAdmin,
    login,
    refresh,
    logout
};