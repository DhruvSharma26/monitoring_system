const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    registerStaff,
    getStaff
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

module.exports = router;