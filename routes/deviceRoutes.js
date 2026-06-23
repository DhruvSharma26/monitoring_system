const express = require("express");

const router = express.Router();

const authMiddleware =
    require("../middleware/authMiddleware");

const {
    registerDevice,
    getDevices,
    getDeviceById
} = require("../controllers/deviceController");

router.post(
    "/",
    authMiddleware,
    registerDevice
);

router.get(
    "/",
    authMiddleware,
    getDevices
);

router.get(
    "/:id",
    authMiddleware,
    getDeviceById
);

module.exports = router;