const express =
require("express");

const router =
express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    updateThresholds,
    getThresholds
} = require(
    "../controllers/settingsController"
);

router.post(
    "/thresholds",
    authMiddleware,
    updateThresholds
);

router.get(
    "/thresholds",
    authMiddleware,
    getThresholds
);

module.exports = router;