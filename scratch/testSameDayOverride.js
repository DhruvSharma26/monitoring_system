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

        const devUid = "DEV_11";
        const device = await Device.findOne({ device_uid: devUid });

        console.log("==================================================");
        console.log("🔍 TESTING SAME-DAY OVERWRITE FOR DEVICE DEV_11");
        console.log("==================================================");

        // Delete any existing alerts for DEV_11 created today to start fresh test
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        await Alert.deleteMany({ device_uid: new RegExp(`^${devUid}$`, 'i'), createdAt: { $gte: todayStart } });

        // 1. Send first telemetry today
        console.log("\n📡 Sending 1st Telemetry today (Counter: 150, Odor: 55)...");
        const res1 = await alertService.processOrCreateDeviceAlert({
            device_uid: devUid,
            deviceId: device.deviceId,
            alertCategory: "Critical",
            alertType: "Critical",
            description: "1st Critical Alert Today",
            Counter: 150,
            OdorSensVal: 55,
            feedback: 2
        });

        console.log(`Result 1 => Alert ID: ${res1.alert._id} | Overwritten: ${res1.isOverwritten} | Status: ${res1.alert.status}`);

        // 2. Send 2nd telemetry 2 seconds later today
        console.log("\n📡 Sending 2nd Telemetry 2 seconds later (Counter: 220, Odor: 75)...");
        const res2 = await alertService.processOrCreateDeviceAlert({
            device_uid: devUid,
            deviceId: device.deviceId,
            alertCategory: "Critical",
            alertType: "Critical",
            description: "2nd Critical Alert Today (Updated Telemetry)",
            Counter: 220,
            OdorSensVal: 75,
            feedback: 3
        });

        console.log(`Result 2 => Alert ID: ${res2.alert._id} | Overwritten: ${res2.isOverwritten} | Status: ${res2.alert.status}`);

        // 3. Send 3rd telemetry 2 seconds later today
        console.log("\n📡 Sending 3rd Telemetry 2 seconds later (Counter: 300, Odor: 85)...");
        const res3 = await alertService.processOrCreateDeviceAlert({
            device_uid: devUid,
            deviceId: device.deviceId,
            alertCategory: "Critical",
            alertType: "Critical",
            description: "3rd Critical Alert Today (Updated Telemetry)",
            Counter: 300,
            OdorSensVal: 85,
            feedback: 3
        });

        console.log(`Result 3 => Alert ID: ${res3.alert._id} | Overwritten: ${res3.isOverwritten} | Status: ${res3.alert.status}`);

        // Check total alert cards in DB for DEV_11 today
        const todayAlertsCount = await Alert.countDocuments({
            device_uid: new RegExp(`^${devUid}$`, 'i'),
            status: { $in: ["OPEN", "ASSIGNED"] },
            createdAt: { $gte: todayStart }
        });

        console.log(`\n📊 Total Open/Assigned Alert Cards in DB for DEV_11 Today: ${todayAlertsCount}`);

        if (res1.alert._id.toString() === res2.alert._id.toString() &&
            res2.alert._id.toString() === res3.alert._id.toString() &&
            res2.isOverwritten === true && res3.isOverwritten === true &&
            todayAlertsCount === 1) {
            console.log("\n  [PASS] SAME-DAY OVERWRITE SUCCESSFUL! Only 1 alert card exists and it was overwritten cleanly!");
        } else {
            console.error("\n  [FAIL] Multiple alert cards were created instead of overwriting!");
            process.exit(1);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
