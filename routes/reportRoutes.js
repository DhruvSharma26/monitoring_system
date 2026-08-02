const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {

    getDailyReport,

    getWeeklyReport,

    getMonthlyReport,
    
    getReportStats,
    getReportsList,
    generateReport,
    getDeviceReports,
    downloadReportPdf,
    downloadReportCsv
} = require("../controllers/reportController");

router.get("/daily", authMiddleware, getDailyReport);
router.get("/weekly", authMiddleware, getWeeklyReport);
router.get("/monthly", authMiddleware, getMonthlyReport);
router.get("/stats", authMiddleware, getReportStats);
router.get("/device-reports", authMiddleware, getDeviceReports);
router.get("/download-pdf", authMiddleware, downloadReportPdf);
router.get("/download-csv", authMiddleware, downloadReportCsv);
router.get("/", authMiddleware, getReportsList);
router.post("/generate", authMiddleware, generateReport);

module.exports = router;