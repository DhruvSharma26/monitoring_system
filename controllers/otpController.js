const Otp = require("../models/Otp");
const SibApiV3Sdk = require("@getbrevo/brevo");

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

        // Initialize Brevo API
        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

        apiInstance.setApiKey(
            SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
            process.env.BREVO_API_KEY
        );

        const sendSmtpEmail = {
            sender: {
                email: process.env.EMAIL_FROM,
                name: "Monitoring System"
            },
            to: [
                {
                    email: email
                }
            ],
            subject: "OTP Verification",
            textContent: `Your OTP is ${otp}`
        };

        await apiInstance.sendTransacEmail(sendSmtpEmail);

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully"
        });

    } catch (error) {

        console.error("Brevo Error:");
        console.error(error.response?.body || error);

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