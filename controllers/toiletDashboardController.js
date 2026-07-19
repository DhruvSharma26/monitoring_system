const Device = require("../models/Device");
const LatestDeviceStatus =
require("../models/LatestDeviceStatus");

const getToilets = async (req, res) => {

    try {

        const { status } = req.query;

        const [devices, statuses] =
            await Promise.all([

                Device.find().lean(),

                LatestDeviceStatus
                    .find()
                    .lean()

            ]);

        const statusMap = {};

        statuses.forEach(item => {

            statusMap[
                item.device_uid
            ] = item;

        });

        const toilets = [];

        for (const device of devices) {

            const latestStatus =
                statusMap[
                    device.device_uid
                ];

            if (!latestStatus)
                continue;

            let toiletStatus =
                "CLEAN";

            if (
                latestStatus.feedback === 2
            ) {

                toiletStatus =
                    "ATTENTION";

            }

            else if (
                latestStatus.feedback === 4
            ) {

                toiletStatus =
                    "CRITICAL";

            }

            if (
                status &&
                toiletStatus.toLowerCase() !==
                status.toLowerCase()
            ) {

                continue;

            }

            let rating = 5;

            switch (
                latestStatus.feedback
            ) {

                case 0:
                case 1:
                    rating = 5;
                    break;

                case 2:
                    rating = 2;
                    break;

                case 4:
                    rating = 1;
                    break;

                default:
                    rating = 5;

            }

            toilets.push({

                deviceId:
                    device.deviceId,

                device_uid:
                    device.device_uid,

                location:
                    device.location,

                floor:
                    device.floor,

                status:
                    toiletStatus,

                rating,

                usageToday:
                    latestStatus.Counter || 0,

                feedback:
                    latestStatus.feedback,

                Counter:
                    latestStatus.Counter || 0,

                OdorSensVal:
                    latestStatus.OdorSensVal || 0,

                latitude:
                    device.latitude,

                longitude:
                    device.longitude,

                timestamp:
                    latestStatus.timestamp

            });

        }

        res.status(200).json({

            success: true,

            count:
                toilets.length,

            toilets

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

    getToilets

};