const Device = require("../models/Device");
const googleMapsService = require("../services/googleMapsService");

const registerDevice = async (req, res) => {
    try {
        const {
            device_uid,
            deviceCategory,
            deviceModelNumber,
            location,
            floor,
            tabLocation,
            latitude,
            longitude,
            installationDate
        } = req.body;

        const count = await Device.countDocuments({
            location,
            floor
        });

        const deviceId =
            location.replace(/\s/g, "") +
            "-" +
            floor +
            "-" +
            String(count + 1).padStart(2, "0");

        let resolvedLat = latitude !== undefined && latitude !== null ? Number(latitude) : undefined;
        let resolvedLng = longitude !== undefined && longitude !== null ? Number(longitude) : undefined;

        // Auto-geocode location via Google Maps API if coordinates were not supplied
        if ((resolvedLat === undefined || resolvedLng === undefined) && location) {
            const geocoded = await googleMapsService.geocodeAddress(location);
            if (geocoded) {
                resolvedLat = geocoded.lat;
                resolvedLng = geocoded.lng;
            }
        }

        const device = await Device.create({
            device_uid,
            deviceId,
            adminId: req.user.id,
            deviceCategory,
            deviceModelNumber,
            location,
            floor,
            tabLocation,
            latitude: resolvedLat,
            longitude: resolvedLng,
            installationDate
        });

        res.status(201).json({
            success: true,
            device
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

const getDevices = async (req, res) => {
    try {
        const devices = await Device.find({ adminId: req.user.id });
        res.status(200).json({
            success: true,
            devices
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

const getDeviceById = async (req, res) => {
    try {
        const device = await Device.findById(req.params.id);
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }
        res.status(200).json({
            success: true,
            device
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

/**
 * Geocode or reverse-geocode location using backend Google Maps SDK key
 */
const geocodeLocation = async (req, res) => {
    try {
        const { address, lat, lng } = req.query;

        if (address) {
            const result = await googleMapsService.geocodeAddress(address);
            if (!result) {
                return res.status(404).json({ success: false, message: "Location not found" });
            }
            return res.status(200).json({ success: true, ...result });
        }

        if (lat != null && lng != null) {
            const formattedAddress = await googleMapsService.reverseGeocode(Number(lat), Number(lng));
            if (!formattedAddress) {
                return res.status(404).json({ success: false, message: "Address not found for coordinates" });
            }
            return res.status(200).json({ success: true, formattedAddress });
        }

        return res.status(400).json({
            success: false,
            message: "Provide either 'address' query param or both 'lat' and 'lng' query params."
        });

    } catch (error) {
        console.error("Error in geocodeLocation:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = {
    registerDevice,
    getDevices,
    getDeviceById,
    geocodeLocation
};