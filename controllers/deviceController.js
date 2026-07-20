const Device = require("../models/Device");

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

        const count =
            await Device.countDocuments({
                location,
                floor
            });

        const deviceId =
            location.replace(/\s/g, "") +
            "-" +
            floor +
            "-" +
            String(count + 1).padStart(2, "0");

        const device =
            await Device.create({

                device_uid,

                deviceId,

                adminId: req.user.id,

                deviceCategory,

                deviceModelNumber,

                location,

                floor,

                tabLocation,

                latitude,

                longitude,

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

        const devices =
            await Device.find({ adminId: req.user.id });

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

        const device =
            await Device.findById(
                req.params.id
            );

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

module.exports = {
    registerDevice,
    getDevices,
    getDeviceById
};