const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {
    getToilets
} = require(
    "../controllers/toiletDashboardController"
);

router.get(
    "/",
    authMiddleware,
    getToilets
);

module.exports = router;