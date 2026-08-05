const User = require("../models/User");
const Otp = require("../models/Otp");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");

const sendForgotOtp = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000);

        await Otp.deleteMany({ email: normalizedEmail });

        await Otp.create({
            email: normalizedEmail,
            otp,
            expiresAt: expiry
        });

        console.log(`📧 [FORGOT OTP GENERATED] OTP ${otp} generated for ${normalizedEmail}`);

        await sendEmail({
            to: normalizedEmail,
            subject: "Sinexus - Password Reset OTP",
            text: `Your OTP for Sinexus password reset is: ${otp}. This OTP is valid for 5 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #1565C0;">Sinexus Password Reset</h2>
                    <p>Use the following OTP to reset your password:</p>
                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1565C0; background: #f0f4f8; padding: 12px 20px; display: inline-block; border-radius: 8px;">
                        ${otp}
                    </div>
                    <p style="margin-top: 20px; font-size: 12px; color: #777;">This OTP will expire in 5 minutes.</p>
                </div>
            `
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

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const trimmedOtp = otp.toString().trim();

        const otpRecord = await Otp.findOne({
            email: normalizedEmail,
            otp: trimmedOtp
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
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email and new password are required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const otpRecord = await Otp.findOne({
            email: normalizedEmail,
            verified: true
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Verify OTP First"
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP Expired. Please request a new OTP."
            });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        await Otp.deleteMany({ email: normalizedEmail });

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