const Otp = require("../models/Otp");
const nodemailer = require("nodemailer");

const sendOtp = async (req, res) => {
    try {

        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

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
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "OTP Verification",
            text: `Your OTP is ${otp}`
        });

        res.status(200).json({
            success: true,
            message: "OTP sent successfully"
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

const verifyOtp = async (req, res) => {

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

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

module.exports = {
    sendOtp,
    verifyOtp
};