const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    getToiletDetails
} = require(
    "../controllers/toiletController"
);

router.get(
    "/:deviceId",
    authMiddleware,
    getToiletDetails
);

module.exports = router;