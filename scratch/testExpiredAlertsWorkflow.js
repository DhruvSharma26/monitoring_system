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
        const Task = require("../models/Task");
        const alertService = require("../services/alertService");

        console.log("==================================================");
        console.log("🔍 TESTING EXPIRED & OVERWRITE ALERT LOGIC FOR DEVICES");
        console.log("==================================================");

        const devUid = "DEV_11";
        const device = await Device.findOne({ device_uid: devUid });

        if (!device) {
            console.error("Device DEV_11 not found!");
            process.exit(1);
        }

        // Create a mock alert from YESTERDAY
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const oldAlert = await Alert.create({
            device_uid: devUid,
            deviceId: device.deviceId,
            device: device._id,
            alertCategory: "Critical",
            alertType: "Critical",
            description: "Old Critical Alert from Yesterday",
            status: "OPEN",
            createdAt: yesterday,
            updatedAt: yesterday
        });

        console.log(`Created Old Unresolved Alert from Yesterday: ID ${oldAlert._id} | Status: ${oldAlert.status} | CreatedAt: ${oldAlert.createdAt.toISOString()}`);

        // Trigger a new alert TODAY for the same device
        const newResult = await alertService.processOrCreateDeviceAlert({
            device_uid: devUid,
            deviceId: device.deviceId,
            alertCategory: "Critical",
            alertType: "Critical",
            description: "New Critical Alert Today",
            Counter: 220,
            OdorSensVal: 70,
            feedback: 2
        });

        console.log(`\nNew Alert Processing Result:`);
        console.log(`   New Alert ID: ${newResult.alert._id} | Overwritten: ${newResult.isOverwritten} | Status: ${newResult.alert.status}`);

        // Refresh old alert from DB
        const refreshedOldAlert = await Alert.findById(oldAlert._id);
        console.log(`   Refreshed Old Alert ID: ${refreshedOldAlert._id} | Status: ${refreshedOldAlert.status} | AssignmentStatus: ${refreshedOldAlert.assignmentStatus}`);

        if (refreshedOldAlert.status === "EXPIRED" && !newResult.isOverwritten) {
            console.log("\n  [PASS] Yesterday's unresolved alert was cleanly marked EXPIRED and a NEW alert card was created for today!");
        } else {
            console.error("\n  [FAIL] Expiration workflow failed!");
            process.exit(1);
        }

        // Clean up mock test alerts
        await Alert.deleteOne({ _id: oldAlert._id });
        await Alert.deleteOne({ _id: newResult.alert._id });
        await Task.deleteMany({ alert: { $in: [oldAlert._id, newResult.alert._id] } });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
