const Otp = require("../models/Otp");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const sendOtp = async (req, res, next) => {
    try {

        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const otp = crypto.randomInt(100000, 999999).toString();

        const expiry = new Date(
            Date.now() + 5 * 60 * 1000
        );

        await Otp.deleteMany({ email });

        await Otp.create({
            email,
            otp,
            expiresAt: expiry
        });

        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        console.log(`📧 [OTP SENT] Sending OTP ${otp} to ${email}`);

        await transporter.sendMail({
            from: `"Sinexus Monitoring" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Sinexus - Email Verification OTP",
            text: `Your OTP for Sinexus email verification is: ${otp}. This OTP is valid for 5 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #1565C0;">Sinexus Email Verification</h2>
                    <p>Use the following OTP to verify your email address during staff registration:</p>
                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1565C0; background: #f0f4f8; padding: 12px 20px; display: inline-block; border-radius: 8px;">
                        ${otp}
                    </div>
                    <p style="margin-top: 20px; font-size: 12px; color: #777;">This OTP will expire in 5 minutes.</p>
                </div>
            `
        });

        res.status(200).json({
            success: true,
            message: `OTP sent successfully to ${email}`
        });

    } catch (error) {
        next(error);
    }
};

const verifyOtp = async (req, res, next) => {

    try {

        const { email, otp } = req.body;

        const otpRecord = await Otp.findOne({
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

module.exports = {
    sendOtp,
    verifyOtp
};