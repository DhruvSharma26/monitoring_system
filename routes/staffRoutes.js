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
    resetStaffPassword,
    updateStaffGalleryAccess
} = require(
    "../controllers/staffController"
);

router.post(
    "/gallery-access",
    authMiddleware,
    updateStaffGalleryAccess
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