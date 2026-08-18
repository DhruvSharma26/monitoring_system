const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const Alert = require("../models/Alert");
        const Task = require("../models/Task");
        const Device = require("../models/Device");

        console.log("==================================================");
        console.log("🧹 CLEANING UP DUPLICATE SAME-DAY ALERTS IN ATLAS");
        console.log("==================================================");

        const devices = await Device.find({});
        let totalCleaned = 0;

        for (const dev of devices) {
            const devUids = [dev.device_uid, dev.deviceId].filter(Boolean);
            const regexes = devUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

            const openAlerts = await Alert.find({
                $or: [
                    { device_uid: { $in: regexes } },
                    { deviceId: { $in: regexes } },
                    { device: dev._id }
                ],
                status: { $in: ["OPEN", "ASSIGNED"] }
            }).sort({ createdAt: -1 });

            if (openAlerts.length > 1) {
                // Keep the most recent alert (index 0), delete/expire older duplicates from today
                const keepAlert = openAlerts[0];
                const duplicateAlerts = openAlerts.slice(1);
                const duplicateIds = duplicateAlerts.map(a => a._id);

                await Alert.deleteMany({ _id: { $in: duplicateIds } });
                await Task.deleteMany({ alert: { $in: duplicateIds } });

                console.log(`Device [${dev.device_uid}]: Kept latest alert ${keepAlert._id}, deleted ${duplicateAlerts.length} duplicate open alerts.`);
                totalCleaned += duplicateAlerts.length;
            }
        }

        console.log(`\n🎉 Cleanup complete! Total duplicate cards removed: ${totalCleaned}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
