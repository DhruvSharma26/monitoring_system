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

        // Filter alerts by admin's devices
        const myDevices = await Device.find({ adminId: req.user.id }).select("device_uid");
        const myDeviceUids = myDevices.map(d => d.device_uid);
        query.device_uid = { $in: myDeviceUids };

        const alerts = await Alert.find(query).sort({ createdAt: -1 }).lean();

        const seenDevices = new Set();
        const latestAlerts = [];

        for (let i = 0; i < alerts.length; i++) {
            // Only keep the most recent alert per device
            if (!seenDevices.has(alerts[i].device_uid)) {
                seenDevices.add(alerts[i].device_uid);
                
                const task = await Task.findOne({ alert: alerts[i]._id }).populate("staff", "name empId userId");
                if (task) {
                    alerts[i].taskId = task._id;
                    alerts[i].taskStatus = task.status;
                    alerts[i].taskProgressPercent = task.progressPercent || 0;
                    alerts[i].taskCleaningPhotos = (task.cleaningPhotos || []).map(p => p.url);
                    alerts[i].assignedAt = task.assignedAt;
                    alerts[i].startedAt = task.startedAt;
                    alerts[i].photosUploadedAt = task.photosUploadedAt;
                    alerts[i].submittedAt = task.submittedAt;
                    alerts[i].completedAt = task.completedAt;
                    alerts[i].verifiedAt = task.verifiedAt;
                    if (task.staff) {
                        alerts[i].assignedStaffName = task.staff.name;
                        alerts[i].assignedStaffEmpId = task.staff.empId || task.staff.userId || "";
                    }
                }
                latestAlerts.push(alerts[i]);
            }
        }

        res.status(200).json({
            success: true,
            count: latestAlerts.length,
            alerts: latestAlerts
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
        
        const task = await Task.create({
            alert: alert._id,
            device: device ? device._id : null,
            staff: staff._id,
            assignedBy: req.user.id,
            status: "ASSIGNED"
        });

        alert.status = "ASSIGNED";
        await alert.save();
        
        // Notify assigned staff
        const notificationService = require("../services/notificationService");
        notificationService.sendTaskAssignedNotification(task, staff, req.user, device);

        res.status(200).json({ success: true, message: "Alert assigned" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const deleteAlert = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access Denied: Only admins can delete alerts"
            });
        }

        const alert = await Alert.findById(req.params.alertId);
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }

        // Verify that the alert is for a device belonging to the admin
        const device = await Device.findOne({ device_uid: alert.device_uid, adminId: req.user.id });
        if (!device) {
            return res.status(403).json({
                success: false,
                message: "Access Denied: You do not manage the device for this alert"
            });
        }

        // Delete associated tasks if they exist
        await Task.deleteMany({ alert: req.params.alertId });

        // Delete the alert
        await Alert.findByIdAndDelete(req.params.alertId);

        res.status(200).json({
            success: true,
            message: "Alert deleted successfully"
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

    getAlerts,

    getAlertDetails,

    resolveAlert,
    
    assignAlert,

    deleteAlert

};