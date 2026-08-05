const Otp = require("../models/Otp");
const User = require("../models/User");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");

const COOLDOWN_SECONDS = 60; // 60-second resend cooldown

/**
 * Generate and dispatch email verification OTP via Brevo REST API.
 * Enforces a 60-second cooldown and ensures only 1 active OTP per user.
 */
const sendOtp = async (req, res, next) => {
    try {
        const { email, type } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email address is required."
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Check if user already exists (for registration flows)
        if (type === "admin" || type === "staff" || type === "general") {
            const existingUser = await User.findOne({ email: normalizedEmail });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: "An account with this email address already exists. Please log in."
                });
            }
        }

        // 2. Cooldown check: Prevent multiple clicks/requests within 60 seconds
        const existingOtpRecord = await Otp.findOne({
            email: normalizedEmail,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });

        if (existingOtpRecord) {
            const now = new Date();
            const elapsedSeconds = Math.floor((now.getTime() - new Date(existingOtpRecord.createdAt).getTime()) / 1000);
            
            if (elapsedSeconds < COOLDOWN_SECONDS) {
                const remainingSeconds = COOLDOWN_SECONDS - elapsedSeconds;
                console.log(`⏱️ [OTP COOLDOWN] ${normalizedEmail} requested OTP too quickly (${remainingSeconds}s cooldown remaining).`);
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${remainingSeconds} seconds before requesting another OTP.`
                });
            }
        }

        // 3. Delete previous OTP records for this email (Ensures 1 valid OTP per user)
        await Otp.deleteMany({ email: normalizedEmail });

        // 4. Generate new 6-digit cryptographically secure OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5-minute expiration

        // 5. Store OTP record in MongoDB
        await Otp.create({
            email: normalizedEmail,
            otp,
            expiresAt: expiry
        });

        console.log(`🔑 [OTP CREATED] Generated OTP ${otp} for ${normalizedEmail} (Type: ${type || 'general'})`);

        let contextText = "registration";
        if (type === "admin") {
            contextText = "admin registration";
        } else if (type === "staff") {
            contextText = "staff registration";
        } else if (type === "forgot_password") {
            contextText = "password reset";
        }

        // 6. Send email directly via Brevo REST API
        try {
            await sendEmail({
                to: normalizedEmail,
                subject: `Sinexus - Email Verification OTP`,
                text: `Your OTP for Sinexus ${contextText} is: ${otp}. This OTP is valid for 5 minutes.`,
                html: `
                    <div style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; padding: 24px; color: #333; max-width: 500px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px;">
                        <h2 style="color: #1565C0; margin-top: 0;">Sinexus Email Verification</h2>
                        <p style="font-size: 14px; color: #555; line-height: 1.5;">
                            Use the following 6-digit OTP to verify your email address for <strong>${contextText}</strong>:
                        </p>
                        <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1565C0; background: #f0f4f8; padding: 16px 24px; text-align: center; border-radius: 8px; margin: 20px 0;">
                            ${otp}
                        </div>
                        <p style="font-size: 12px; color: #888; margin-bottom: 0;">
                            This OTP is valid for <strong>5 minutes</strong>. If you did not request this email, please ignore it.
                        </p>
                    </div>
                `
            });

            return res.status(200).json({
                success: true,
                message: `OTP sent successfully to ${normalizedEmail}`
            });

        } catch (emailError) {
            // If email dispatch fails, rollback the generated OTP so user can retry immediately
            await Otp.deleteMany({ email: normalizedEmail });

            console.error(`❌ [OTP FAILURE] Failed to deliver email to ${normalizedEmail}: ${emailError.message}`);

            return res.status(500).json({
                success: false,
                message: emailError.message || "Failed to send OTP email. Please try again."
            });
        }

    } catch (error) {
        next(error);
    }
};

/**
 * Verify OTP submitted by user.
 */
const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required."
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
                message: "Invalid OTP. Please check the code and try again."
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new code."
            });
        }

        otpRecord.verified = true;
        await otpRecord.save();

        console.log(`✅ [OTP VERIFIED] Email ${normalizedEmail} successfully verified.`);

        res.status(200).json({
            success: true,
            message: "OTP verified successfully."
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    sendOtp,
    verifyOtp
};