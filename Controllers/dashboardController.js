const Device = require("../models/Device");
const LatestDeviceStatus = require("../models/LatestDeviceStatus");
const Alert = require("../models/Alert");
const Settings = require("../models/Settings");

// ----------------------------------------------------
// Dashboard Summary
// ----------------------------------------------------

const getDashboard = async (req, res) => {
    try {

        const [totalToilets, statuses, liveAlerts] =
            await Promise.all([

                Device.countDocuments(),

                LatestDeviceStatus.find().lean(),

                Alert.find({
                    status: "OPEN"
                })
                    .sort({
                        createdAt: -1
                    })
                    .limit(5)
                    .lean()

            ]);

        let clean = 0;
        let attention = 0;
        let critical = 0;
        let totalRating = 0;

        statuses.forEach(item => {

            if (
                item.feedback === 1 ||
                item.feedback === 2
            ) {
                clean++;
            }

            else if (
                item.feedback === 3
            ) {
                attention++;
            }

            else if (
                item.feedback === 4
            ) {
                critical++;
            }

            switch (item.feedback) {

                case 1:
                    totalRating += 5;
                    break;

                case 2:
                    totalRating += 4;
                    break;

                case 3:
                    totalRating += 2;
                    break;

                case 4:
                    totalRating += 1;
                    break;

            }

        });

        const averageRating =
            statuses.length > 0
                ? (
                    totalRating /
                    statuses.length
                ).toFixed(1)
                : 0;

        res.status(200).json({

            success: true,

            dashboard: {

                totalToilets,

                cleanToilets: clean,

                attentionToilets:
                    attention,

                criticalToilets:
                    critical,

                averageRating,

                liveAlerts

            }

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

// ----------------------------------------------------
// Map Data
// ----------------------------------------------------

const getMapData = async (req, res) => {

    try {

        const [devices, statuses] =
            await Promise.all([

                Device.find().lean(),

                LatestDeviceStatus
                    .find()
                    .lean()

            ]);

        const statusMap = {};

        statuses.forEach(status => {

            statusMap[
                status.device_uid
            ] = status;

        });

        const mapData =
            devices.map(device => {

                const statusData =
                    statusMap[
                        device.device_uid
                    ];

                let status = "clean";

                if (statusData) {

                    switch (
                        statusData.feedback
                    ) {

                        case 1:
                        case 2:
                            status = "clean";
                            break;

                        case 3:
                            status = "attention";
                            break;

                        case 4:
                            status = "critical";
                            break;

                    }

                }

                return {

                    device_uid:
                        device.device_uid,

                    deviceId:
                        device.deviceId,

                    location:
                        device.location,

                    latitude:
                        device.latitude,

                    longitude:
                        device.longitude,

                    status

                };

            });

        res.status(200).json({
            success: true,
            data: mapData
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

// ----------------------------------------------------
// Live Alerts
// ----------------------------------------------------

const getLiveAlerts = async (req, res) => {

    try {

        const settings =
            await Settings.findOne({
                adminId:
                    req.user.id
            }).lean();

        const counterThreshold =
            settings?.counterThreshold || 100;

        const odorThreshold =
            settings?.odorThreshold || 80;

        const [devices, statuses] =
            await Promise.all([

                Device.find().lean(),

                LatestDeviceStatus
                    .find()
                    .lean()

            ]);

        const statusMap = {};

        statuses.forEach(status => {

            statusMap[
                status.device_uid
            ] = status;

        });

        const alerts = [];

        for (const device of devices) {

            const status =
                statusMap[
                    device.device_uid
                ];

            if (!status)
                continue;

            let alertType = null;

            if (
                status.feedback === 4
            ) {

                alertType =
                    "CRITICAL_FEEDBACK";

            }

            else if (
                (status.Counter || 0) >
                counterThreshold
            ) {

                alertType =
                    "HIGH_USAGE";

            }

            else if (
                (status.OdorSensVal || 0) >
                odorThreshold
            ) {

                alertType =
                    "HIGH_ODOR";

            }

            if (alertType) {

                alerts.push({

                    device_uid:
                        device.device_uid,

                    deviceId:
                        device.deviceId,

                    location:
                        device.location,

                    alertType,

                    feedback:
                        status.feedback,

                    Counter:
                        status.Counter,

                    OdorSensVal:
                        status.OdorSensVal,

                    timestamp:
                        status.timestamp

                });

            }

        }

        res.status(200).json({

            success: true,

            count:
                alerts.length,

            alerts

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};

// ----------------------------------------------------
// Attention / Critical Toilets
// ----------------------------------------------------

const getAttentionCriticalToilets =
    async (req, res) => {

        try {

            const [devices, statuses] =
                await Promise.all([

                    Device.find().lean(),

                    LatestDeviceStatus
                        .find()
                        .lean()

                ]);

            const statusMap = {};

            statuses.forEach(status => {

                statusMap[
                    status.device_uid
                ] = status;

            });

            const toilets = [];

            for (const device of devices) {

                const status =
                    statusMap[
                        device.device_uid
                    ];

                if (!status)
                    continue;

                if (
                    status.feedback === 3 ||
                    status.feedback === 4
                ) {

                    toilets.push({

                        device_uid:
                            device.device_uid,

                        deviceId:
                            device.deviceId,

                        location:
                            device.location,

                        floor:
                            device.floor,

                        latitude:
                            device.latitude,

                        longitude:
                            device.longitude,

                        feedback:
                            status.feedback,

                        status:
                            status.feedback === 3
                                ? "ATTENTION"
                                : "CRITICAL",

                        Counter:
                            status.Counter,

                        OdorSensVal:
                            status.OdorSensVal,

                        timestamp:
                            status.timestamp

                    });

                }

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
                message: "Server Error"
            });

        }

    };

module.exports = {

    getDashboard,

    getMapData,

    getLiveAlerts,

    getAttentionCriticalToilets

};