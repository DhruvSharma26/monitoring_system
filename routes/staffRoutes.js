const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    registerStaff,
    getStaff,
    deleteStaff,
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
    "/:id/reset-password",
    authMiddleware,
    resetStaffPassword
);

module.exports = router;