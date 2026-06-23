const express = require("express");

const router = express.Router();

const {
    sendForgotOtp,
    verifyForgotOtp,
    resetPassword
} = require(
    "../controllers/passwordController"
);

router.post(
    "/forgot",
    sendForgotOtp
);

router.post(
    "/verify-otp",
    verifyForgotOtp
);

router.post(
    "/reset",
    resetPassword
);

module.exports = router;