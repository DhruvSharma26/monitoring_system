const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    getDashboard,
    getMapData,
    getLiveAlerts,
    getAttentionCriticalToilets
} = require(
    "../controllers/dashboardController"
);

router.get(
    "/overview",
    authMiddleware,
    getDashboard
);

router.get(
    "/map",
    authMiddleware,
    getMapData
);

router.get(
    "/alerts",
    authMiddleware,
    getLiveAlerts
);
router.get(
    "/attention-critical",
    authMiddleware,
    getAttentionCriticalToilets
);
module.exports = router;