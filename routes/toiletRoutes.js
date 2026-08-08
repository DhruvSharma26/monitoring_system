const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    getToiletDetails,
    markToiletClean,
    postToiletTelemetry
} = require(
    "../controllers/toiletController"
);

router.get(
    "/:deviceId",
    authMiddleware,
    getToiletDetails
);

router.post(
    "/:deviceId/mark-clean",
    authMiddleware,
    markToiletClean
);

router.post(
    "/:deviceId/telemetry",
    authMiddleware,
    postToiletTelemetry
);

module.exports = router;