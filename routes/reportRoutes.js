const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {

    getDailyReport,

    getWeeklyReport,

    getMonthlyReport

} = require(
    "../controllers/reportController"
);

router.get(
    "/daily",
    authMiddleware,
    getDailyReport
);

router.get(
    "/weekly",
    authMiddleware,
    getWeeklyReport
);

router.get(
    "/monthly",
    authMiddleware,
    getMonthlyReport
);

module.exports = router;