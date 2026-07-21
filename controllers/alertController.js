const Alert = require("../models/Alert");
const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const User = require("../models/User");
const Task = require("../models/Task");

const getAlerts = async (req, res) => {

    try {

        const { type } = req.query;

        let query = {};

        if (type === "critical") {

            query.feedback = 4;

        }

        if (type === "attention") {

            query.feedback = 3;

        }

        const alerts =
        await Alert.find(query)
        .sort({
            createdAt: -1
        });

        res.status(200).json({
            success: true,
            count: alerts.length,
            alerts
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const getAlertDetails = async (req, res) => {

    try {

        const alert =
        await Alert.findById(
            req.params.alertId
        );

        if (!alert) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });

        }

        const device =
        await Device.findOne({
            device_uid:
            alert.device_uid
        });

        const latestSensor =
        await SensorData.findOne({
            device_uid:
            alert.device_uid
        })
        .sort({
            timestamp: -1
        });

        res.status(200).json({

            success: true,

            alert,

            device,

            latestSensor

        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const resolveAlert = async (req, res) => {

    try {

        const alertId = req.params.alertId || req.body.alertId;

        const alert =
        await Alert.findById(alertId);

        if (!alert) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });

        }

        alert.status = "RESOLVED";

        await alert.save();

        res.status(200).json({
            success: true,
            message: "Alert Resolved"
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

const assignAlert = async (req, res) => {
    try {
        const { staff_id } = req.body;
        const alertId = req.params.alertId;
        
        const alert = await Alert.findById(alertId);
        if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
        
        const staff = await User.findOne({ 
            $or: [{ userId: staff_id }, { empId: staff_id }], 
            role: "staff" 
        });
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });

        const device = await Device.findOne({ device_uid: alert.device_uid });
        
        await Task.create({
            alert: alert._id,
            device: device ? device._id : null,
            staff: staff._id,
            assignedBy: req.user.id,
            status: "ASSIGNED"
        });

        alert.status = "ASSIGNED";
        await alert.save();
        
        res.status(200).json({ success: true, message: "Alert assigned" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {

    getAlerts,

    getAlertDetails,

    resolveAlert,
    
    assignAlert

};