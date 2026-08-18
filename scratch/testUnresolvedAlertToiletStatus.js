const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const Device = require("../models/Device");
        const Alert = require("../models/Alert");
        const LatestDeviceStatus = require("../models/LatestDeviceStatus");
        const Settings = require("../models/Settings");
        const { classifyTelemetry } = require("../services/alertClassifier");

        const adminIdVal = "6a4cc11050c84e14ea0e8cef";

        const devices = await Device.find({ adminId: new mongoose.Types.ObjectId(adminIdVal) }).lean();
        const settings = await Settings.findOne({ adminId: adminIdVal }).lean() || await Settings.findOne().lean();

        console.log("==================================================");
        console.log("🔍 TESTING ACTIVE UNRESOLVED ALERTS RULE FOR TOILET STATUS:");
        console.log("==================================================");

        for (const dev of devices) {
            const devUids = [dev.device_uid, dev.deviceId, dev._id ? dev._id.toString() : null].filter(Boolean);
            const uidsRegex = devUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

            // Query unresolved alerts for this device
            const activeAlerts = await Alert.find({
                $or: [{ device: dev._id }, { device_uid: { $in: uidsRegex } }, { deviceId: { $in: uidsRegex } }],
                status: { $in: ["OPEN", "ASSIGNED"] }
            }).lean();

            let computedStatus = "Clean";

            if (activeAlerts.length > 0) {
                // If any unresolved alert is Critical
                const hasCritical = activeAlerts.some(a => {
                    const cat = (a.alertCategory || a.alertType || a.toiletStatus || '').toLowerCase();
                    return cat.includes('critical');
                });

                if (hasCritical) {
                    computedStatus = "Critical";
                } else {
                    computedStatus = "Need Attention";
                }
            } else {
                // Fallback to latest telemetry if no active open alerts
                const latestStatus = await LatestDeviceStatus.findOne({
                    $or: [{ device_uid: { $in: uidsRegex } }, { deviceId: { $in: uidsRegex } }]
                }).lean();

                if (latestStatus && latestStatus.timestamp) {
                    const latestDateStr = new Date(latestStatus.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                    const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                    if (latestDateStr === todayDateStr) {
                        const classification = classifyTelemetry(latestStatus.feedback, latestStatus.Counter, latestStatus.OdorSensVal, settings);
                        computedStatus = classification.toiletStatus || "Clean";
                    }
                }
            }

            console.log(`Device: ${dev.deviceId} (${dev.device_uid})`);
            console.log(`   Active Unresolved Alerts Count: ${activeAlerts.length}`);
            console.log(`   Computed Toilet Status: "${computedStatus}"\n`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
