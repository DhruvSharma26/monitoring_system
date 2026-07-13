const User = require("../models/User");
const Otp = require("../models/Otp");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const sendForgotOtp = async (req, res, next) => {

    try {

        const { email } = req.body;

        const user = await User.findOne({ email });

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        const otp = crypto.randomInt(100000, 999999).toString();

        const expiry =
            new Date(
                Date.now() + 5 * 60 * 1000
            );

        await Otp.deleteMany({ email });

        await Otp.create({
            email,
            otp,
            expiresAt: expiry
        });

        const transporter =
            nodemailer.createTransport({
                host: "smtp.gmail.com",
                port: 465,
                secure: true,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Password Reset OTP",
            text: `Your OTP is ${otp}`
        });

        res.status(200).json({
            success: true,
            message: "OTP Sent"
        });

    } catch (error) {
        next(error);
    }

};

const verifyForgotOtp = async (req, res, next) => {

    try {

        const { email, otp } = req.body;

        const otpRecord =
            await Otp.findOne({
                email,
                otp
            });

        if (!otpRecord) {

            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });

        }

        if (otpRecord.expiresAt < new Date()) {

            return res.status(400).json({
                success: false,
                message: "OTP Expired"
            });

        }

        otpRecord.verified = true;

        await otpRecord.save();

        res.status(200).json({
            success: true,
            message: "OTP Verified"
        });

    } catch (error) {
        next(error);
    }

};

const resetPassword = async (req, res, next) => {

    try {

        const {
            email,
            newPassword
        } = req.body;

        const otpRecord =
            await Otp.findOne({
                email,
                verified: true
            });

        if (!otpRecord) {

            return res.status(400).json({
                success: false,
                message: "Verify OTP First"
            });

        }

        const user =
            await User.findOne({ email });

        const hashedPassword =
            await bcrypt.hash(
                newPassword,
                10
            );

        user.password =
            hashedPassword;

        await user.save();

        await Otp.deleteMany({
            email
        });

        res.status(200).json({
            success: true,
            message: "Password Reset Successful"
        });

    } catch (error) {
        next(error);
    }

};

module.exports = {
    sendForgotOtp,
    verifyForgotOtp,
    resetPassword
};