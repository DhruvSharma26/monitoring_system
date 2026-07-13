const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    getToiletDetails,
    markToiletClean
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

module.exports = router;