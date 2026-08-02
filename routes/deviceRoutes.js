const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    registerDevice,
    getDevices,
    getDeviceById,
    geocodeLocation,
    deleteDevice
} = require("../controllers/deviceController");

router.get("/geocode", authMiddleware, geocodeLocation);

router.post("/", authMiddleware, registerDevice);

router.get("/", authMiddleware, getDevices);

router.get("/:id", authMiddleware, getDeviceById);

router.delete("/:id", authMiddleware, deleteDevice);

module.exports = router;