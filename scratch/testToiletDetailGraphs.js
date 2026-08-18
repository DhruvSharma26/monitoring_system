const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { getToiletDetails } = require("../controllers/toiletController");
        const SensorData = require("../models/SensorData");
        const LatestDeviceStatus = require("../models/LatestDeviceStatus");
        const Task = require("../models/Task");

        console.log("==================================================");
        console.log("🔍 TESTING TOILET DETAILS GRAPHS FOR DEV_11");
        console.log("==================================================");

        const devUid = "DEV_11";
        const reqMock = { params: { deviceId: devUid }, user: { id: "6a4cc11050c84e14ea0e8cef" } };
        let result = null;
        const resMock = { status: function() { return this; }, json: function(data) { result = data; return data; } };

        await getToiletDetails(reqMock, resMock);

        console.log(`\nAPI Response Success: ${result.success}`);
        console.log(`Device ID: ${result.device ? result.device.deviceId : "N/A"} | UID: ${result.device ? result.device.device_uid : "N/A"}`);
        console.log(`Status: ${result.status} | Average Rating: ${result.averageRating} | Total Usage: ${result.totalUsage}`);

        console.log("\n📊 4 Graph Datasets returned in weeklyAnalysis:");

        console.log("\n1. Counter History Graph:");
        console.log(JSON.stringify(result.weeklyAnalysis.counterHistory, null, 2));

        console.log("\n2. Odor History Graph:");
        console.log(JSON.stringify(result.weeklyAnalysis.odorHistory, null, 2));

        console.log("\n3. Rating History Graph:");
        console.log(JSON.stringify(result.weeklyAnalysis.ratingHistory, null, 2));

        console.log("\n4. Cleaning History Graph:");
        console.log(JSON.stringify(result.weeklyAnalysis.cleaningHistory, null, 2));

        // Check SensorData records for DEV_11 in DB
        const totalSensorLogs = await SensorData.countDocuments({
            $or: [{ device_uid: /DEV_11/i }, { deviceId: /DEV_11/i }, { deviceId: /OPULENTMALL-F1-01/i }]
        });
        console.log(`\nTotal SensorData records in DB for DEV_11: ${totalSensorLogs}`);

        const recentSensorLogs = await SensorData.find({
            $or: [{ device_uid: /DEV_11/i }, { deviceId: /DEV_11/i }, { deviceId: /OPULENTMALL-F1-01/i }]
        }).sort({ timestamp: -1 }).limit(10).lean();

        console.log(`Recent 10 SensorData logs for DEV_11:`);
        recentSensorLogs.forEach((l, i) => {
            console.log(`   [Log ${i + 1}] ID: ${l._id} | Counter: ${l.Counter ?? l.CounterValue} | Odor: ${l.OdorSensVal ?? l.OdorLevel} | Feedback: ${l.feedback} | Timestamp: ${l.timestamp}`);
        });

        // Check LatestDeviceStatus for DEV_11
        const latestStatus = await LatestDeviceStatus.findOne({
            $or: [{ device_uid: /DEV_11/i }, { deviceId: /DEV_11/i }, { deviceId: /OPULENTMALL-F1-01/i }]
        }).lean();
        console.log(`\nLatestDeviceStatus record for DEV_11:`, latestStatus);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
