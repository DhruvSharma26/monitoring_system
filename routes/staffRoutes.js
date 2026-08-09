const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    registerStaff,
    getStaff,
    deleteStaff,
    sendStaffResetOtp,
    verifyStaffResetOtp,
    resetStaffPassword
} = require(
    "../controllers/staffController"
);

router.post(
    "/",
    authMiddleware,
    registerStaff
);

router.get(
    "/",
    authMiddleware,
    getStaff
);

router.delete(
    "/:id",
    authMiddleware,
    deleteStaff
);

router.post(
    "/:id/send-reset-otp",
    authMiddleware,
    sendStaffResetOtp
);

router.post(
    "/:id/verify-reset-otp",
    authMiddleware,
    verifyStaffResetOtp
);

router.post(
    "/:id/reset-password",
    authMiddleware,
    resetStaffPassword
);

module.exports = router;