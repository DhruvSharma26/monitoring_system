const express =
require("express");

const router =
express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    updateThresholds
} = require(
    "../controllers/settingsController"
);

router.post(
    "/thresholds",
    authMiddleware,
    updateThresholds
);

module.exports = router;