const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const LatestDeviceStatus =
require("../models/LatestDeviceStatus");
const User = require("../models/User");
const Alert = require("../models/Alert");
const Task = require("../models/Task");

const getToiletDetails = async (req, res) => {

    try {

        const { deviceId } = req.params;

        const device =
            await Device.findOne({
                deviceId
            }).lean();

        if (!device) {

            return res.status(404).json({
                success: false,
                message: "Device not found"
            });

        }

        const [
            latestStatus,
            alerts,
            tasks,
            staff,
            sensorHistory
        ] = await Promise.all([

            LatestDeviceStatus.findOne({
                device_uid:
                    device.device_uid
            }).lean(),

            Alert.find({
                device_uid:
                    device.device_uid
            })
                .sort({
                    createdAt: -1
                })
                .limit(10)
                .lean(),

            Task.find({
                device: device._id
            })
                .populate("staff")
                .sort({
                    createdAt: -1
                }),

            User.findOne({
                assignedDevice:
                    device._id
            }).lean(),

            SensorData.find({
                device_uid:
                    device.device_uid
            })
                .sort({
                    timestamp: -1
                })
                .limit(10)
                .lean()

        ]);

        let status = "CLEAN";

        if (latestStatus) {

            if (
                latestStatus.feedback === 3
            ) {

                status =
                    "ATTENTION";

            }

            else if (
                latestStatus.feedback === 4
            ) {

                status =
                    "CRITICAL";

            }

        }

        res.status(200).json({

            success: true,

            device,

            status,

            latestSensor:
                latestStatus,

            staff,

            alerts,

            tasks,

            sensorHistory

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            message:
                "Server Error"

        });

    }

};

module.exports = {

    getToiletDetails

};