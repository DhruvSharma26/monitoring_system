const express = require("express");

const router = express.Router();

const {
    sendForgotOtp,
    verifyForgotOtp,
    resetPassword
} = require(
    "../controllers/passwordController"
);
const { otpLimiter } = require("../middleware/rateLimiter");
const { emailOtpValidator, verifyOtpValidator, resetPasswordValidator } = require("../middleware/validators");

router.post(
    "/forgot",
    otpLimiter,
    emailOtpValidator,
    sendForgotOtp
);

router.post(
    "/verify-otp",
    otpLimiter,
    verifyOtpValidator,
    verifyForgotOtp
);

router.post(
    "/reset",
    otpLimiter,
    resetPasswordValidator,
    resetPassword
);

module.exports = router;