const express = require("express");

const router = express.Router();

const {
    sendOtp,
    verifyOtp
} = require("../controllers/otpController");
const { otpLimiter } = require("../middleware/rateLimiter");
const { emailOtpValidator, verifyOtpValidator } = require("../middleware/validators");

router.post(
    "/send",
    otpLimiter,
    emailOtpValidator,
    sendOtp
);

router.post(
    "/verify",
    otpLimiter,
    verifyOtpValidator,
    verifyOtp
);

module.exports = router;