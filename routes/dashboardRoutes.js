const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getDashboard,
    getMapData,
    getLiveAlerts,
    getAttentionCriticalToilets,
    getToiletRatingComparison
} = require("../controllers/dashboardController");

router.get("/", authMiddleware, getDashboard);
router.get("/overview", authMiddleware, getDashboard);
router.get("/map", authMiddleware, getMapData);
router.get("/alerts", authMiddleware, getLiveAlerts);
router.get("/attention-critical", authMiddleware, getAttentionCriticalToilets);
router.get("/toilet-rating-analysis", authMiddleware, getToiletRatingComparison);

module.exports = router;
