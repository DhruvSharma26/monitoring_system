const mongoose = require("mongoose");
const Device = require("../models/Device");
const User = require("../models/User");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const googleMapsService = require("../services/googleMapsService");

const registerDevice = async (req, res) => {
    try {
        const {
            device_uid,
            deviceCategory,
            deviceModelNumber,
            location,
            locationName,
            address,
            floor,
            tabLocation,
            latitude,
            longitude,
            installationDate
        } = req.body;

        const locName = (locationName || location || "DEV").trim();
        const locAddress = (address || location || locName).trim();

        const count = await Device.countDocuments({
            $or: [
                { locationName: locName, floor },
                { location: locName, floor }
            ]
        });

        const cleanLoc = locName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        const cleanFloor = (floor || "F1").replace(/\s/g, "").toUpperCase();
        const deviceId = `${cleanLoc || "DEV"}-${cleanFloor}-${String(count + 1).padStart(2, "0")}`;

        let resolvedLat = latitude !== undefined && latitude !== null ? Number(latitude) : undefined;
        let resolvedLng = longitude !== undefined && longitude !== null ? Number(longitude) : undefined;

        // Auto-geocode address via Google Maps API to fetch real geographical coordinates if not provided
        if ((resolvedLat === undefined || resolvedLng === undefined) && locAddress) {
            const geocoded = await googleMapsService.geocodeAddress(locAddress);
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
            locationName: locName,
            address: locAddress,
            location: locAddress || locName,
            floor,
            tabLocation: tabLocation || locName,
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
        const devices = await Device.find({ adminId: req.user.id }).sort({ createdAt: -1 });
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

const autocompletePlaces = async (req, res) => {
    try {
        const { input, sessionToken, lat, lng } = req.query;
        if (!input) {
            return res.status(400).json({ success: false, message: "Input parameter is required" });
        }
        const suggestions = await googleMapsService.autocompletePlaces(input, sessionToken, lat, lng);
        return res.status(200).json({ success: true, suggestions });
    } catch (error) {
        console.error("Error in autocompletePlaces controller:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const getPlaceDetails = async (req, res) => {
    try {
        const { placeId } = req.params;
        const { sessionToken } = req.query;
        if (!placeId) {
            return res.status(400).json({ success: false, message: "Place ID is required" });
        }
        const details = await googleMapsService.getPlaceDetails(placeId, sessionToken);
        if (!details) {
            return res.status(404).json({ success: false, message: "Place details not found" });
        }
        return res.status(200).json({ success: true, details });
    } catch (error) {
        console.error("Error in getPlaceDetails controller:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const deleteDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id);
        const device = await Device.findOne({
            $or: isObjectId
                ? [{ _id: id }, { deviceId: id }, { device_uid: id }]
                : [{ deviceId: id }, { device_uid: id }],
            adminId: req.user.id
        });

        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found or unauthorized"
            });
        }

        const now = new Date();

        // 1. Deactivate active Assignment records for this device
        const Assignment = require("../models/Assignment");
        await Assignment.updateMany(
            { device: device._id, status: "ACTIVE" },
            { $set: { status: "INACTIVE", unassignedAt: now } }
        );

        // 2. Unassign staff associated with device in User collection
        await User.updateMany(
            { assignedDevice: device._id },
            { $unset: { assignedDevice: 1 } }
        );

        // 3. Cancel unstarted active tasks for deleted device so staff no longer see/act on them
        const Task = require("../models/Task");
        const openTasks = await Task.find({ device: device._id, status: "ASSIGNED", startedAt: { $exists: false } });
        for (const t of openTasks) {
            t.status = "CANCELLED";
            t.timeline.push({
                status: "CANCELLED",
                timestamp: now,
                updatedBy: req.user ? req.user.id : null,
                notes: "Task cancelled automatically due to device deletion by admin"
            });
            await t.save();
        }

        // 4. Resolve active open alerts for deleted device so they no longer generate operational actions
        const Alert = require("../models/Alert");
        await Alert.updateMany(
            { $or: [{ device: device._id }, { device_uid: device.device_uid }], status: { $in: ["OPEN", "ASSIGNED"] } },
            { $set: { status: "RESOLVED", resolvedAt: now } }
        );

        // 5. Delete latest status and device record
        await LatestDeviceStatus.deleteMany({ device_uid: device.device_uid });
        await Device.findByIdAndDelete(device._id);

        if (global.io) {
            global.io.emit("device_deleted", { deviceId: device._id, device_uid: device.device_uid });
            global.io.emit("assignments_updated", { deviceId: device._id });
        }

        res.status(200).json({
            success: true,
            message: "Device removed successfully"
        });
    } catch (error) {
        console.error("Error in deleteDevice:", error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

module.exports = {
    registerDevice,
    getDevices,
    getDeviceById,
    geocodeLocation,
    autocompletePlaces,
    getPlaceDetails,
    deleteDevice
};