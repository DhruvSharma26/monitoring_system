const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    registerStaff,
    getStaff,
    deleteStaff
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

module.exports = router;