require("dotenv").config();
const mongoose = require("mongoose");
const Device = require("../models/Device");
const Alert = require("../models/Alert");
const Task = require("../models/Task");
const SensorData = require("../models/SensorData");
const User = require("../models/User");

async function checkDev11() {
    console.log("==========================================");
    console.log("🔍 CHECKING DEV_11 IN MONGODB DATABASE");
    console.log("==========================================");

    if (!process.env.MONGO_URI) {
        console.log("❌ MONGO_URI not found in env");
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log("✅ Connected to MongoDB!");

        // 1. Check Devices
        const devRegex = /DEV_11|DEV-11|DEV11/i;
        const devices = await Device.find({
            $or: [
                { device_uid: devRegex },
                { deviceId: devRegex }
            ]
        }).lean();

        console.log(`\n1. Devices matching DEV_11 (${devices.length} found):`);
        console.log(JSON.stringify(devices, null, 2));

        // 2. Check All Devices in DB to see their device_uids
        const allDevices = await Device.find().select("device_uid deviceId location assignedStaff adminId").lean();
        console.log(`\nTotal Registered Devices in DB: ${allDevices.length}`);
        allDevices.forEach(d => {
            console.log(`  - Device: _id=${d._id}, device_uid="${d.device_uid}", deviceId="${d.deviceId}", location="${d.location}", assignedStaff=${d.assignedStaff}, adminId=${d.adminId}`);
        });

        // 3. Check Alerts
        const alerts = await Alert.find({
            $or: [
                { device_uid: devRegex },
                { deviceId: devRegex }
            ]
        }).sort({ createdAt: -1 }).lean();
        console.log(`\n2. Alerts matching DEV_11 (${alerts.length} found):`);
        console.log(JSON.stringify(alerts, null, 2));

        // 4. Check Tasks
        const tasks = await Task.find({
            $or: [
                { device_uid: devRegex },
                { deviceId: devRegex }
            ]
        }).sort({ createdAt: -1 }).lean();
        console.log(`\n3. Tasks matching DEV_11 (${tasks.length} found):`);
        console.log(JSON.stringify(tasks, null, 2));

        // 5. Check Recent Alerts overall in DB
        const recentAlerts = await Alert.find().sort({ createdAt: -1 }).limit(10).lean();
        console.log(`\n4. Top 10 Most Recent Alerts in DB:`);
        recentAlerts.forEach(a => {
            console.log(`  - Alert: _id=${a._id}, device_uid="${a.device_uid}", status="${a.status}", alertCategory="${a.alertCategory}", createdAt=${a.createdAt}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error("❌ DB Error:", err);
    }
}

checkDev11();
