const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    registerDevice,
    getDevices,
    getDeviceById,
    geocodeLocation,
    autocompletePlaces,
    getPlaceDetails,
    deleteDevice
} = require("../controllers/deviceController");

router.get("/geocode", authMiddleware, geocodeLocation);
router.get("/places/autocomplete", authMiddleware, autocompletePlaces);
router.get("/places/details/:placeId", authMiddleware, getPlaceDetails);

router.post("/", authMiddleware, registerDevice);

router.get("/", authMiddleware, getDevices);

router.get("/:id", authMiddleware, getDeviceById);

router.delete("/:id", authMiddleware, deleteDevice);

module.exports = router;