const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const Device = require("../models/Device");
        const LatestDeviceStatus = require("../models/LatestDeviceStatus");
        const Settings = require("../models/Settings");
        const { classifyTelemetry } = require("../services/alertClassifier");

        const adminIdVal = "6a4cc11050c84e14ea0e8cef";

        const devices = await Device.find({ adminId: new mongoose.Types.ObjectId(adminIdVal) }).lean();
        const settings = await Settings.findOne({ adminId: adminIdVal }).lean() || await Settings.findOne().lean();
        const statuses = await LatestDeviceStatus.find().lean();

        const statusMap = {};
        statuses.forEach(item => {
            if (item.device_uid) statusMap[item.device_uid.toLowerCase()] = item;
            if (item.deviceId) statusMap[item.deviceId.toLowerCase()] = item;
        });

        const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        console.log("==================================================");
        console.log("🔍 TESTING LATEST MQTT TELEMETRY STATUS FOR ALL DEVICES:");
        console.log("==================================================");

        for (const dev of devices) {
            const devUids = [dev.device_uid, dev.deviceId, dev._id ? dev._id.toString() : null].filter(Boolean);
            let latestStatus = {};
            for (const u of devUids) {
                if (statusMap[u.toLowerCase()]) {
                    latestStatus = statusMap[u.toLowerCase()];
                    break;
                }
            }

            const latestDateStr = latestStatus.timestamp ? new Date(latestStatus.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;
            const isToday = Boolean(latestDateStr && latestDateStr === todayDateStr);

            let toiletStatus = "Clean";
            if (isToday) {
                const classification = classifyTelemetry(
                    latestStatus.feedback,
                    latestStatus.Counter ?? latestStatus.CounterValue,
                    latestStatus.OdorSensVal ?? latestStatus.OdorLevel,
                    settings
                );
                toiletStatus = classification.toiletStatus || "Clean";
            }

            console.log(`Device: ${dev.deviceId} (${dev.device_uid})`);
            console.log(`   Latest Telemetry Timestamp: ${latestStatus.timestamp || "None"}`);
            console.log(`   Latest Telemetry -> Counter: ${latestStatus.Counter ?? latestStatus.CounterValue}, Odor: ${latestStatus.OdorSensVal ?? latestStatus.OdorLevel}, Feedback: ${latestStatus.feedback}`);
            console.log(`   Status: "${toiletStatus}"\n`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
