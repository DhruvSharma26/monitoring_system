const Otp = require("../models/Otp");
const axios = require("axios");

const sendOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const expiry = new Date(Date.now() + 5 * 60 * 1000);

        await Otp.deleteMany({ email });

        await Otp.create({
            email,
            otp,
            expiresAt: expiry
        });

        await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            {
                sender: {
                    name: "Monitoring System",
                    email: process.env.EMAIL_FROM
                },
                to: [
                    {
                        email: email
                    }
                ],
                subject: "OTP Verification",
                textContent: `Your OTP is ${otp}`
            },
            {
                headers: {
                    "api-key": process.env.BREVO_API_KEY,
                    "Content-Type": "application/json"
                }
            }
        );

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully"
        });

    } catch (error) {

        console.error("Brevo Error:");
        console.error(error.response?.data || error.message);

        return res.status(500).json({
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

        return res.status(200).json({
            success: true,
            message: "OTP Verified"
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

module.exports = {
    sendOtp,
    verifyOtp
};