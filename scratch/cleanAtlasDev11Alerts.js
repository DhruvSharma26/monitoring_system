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

        const devUid = "DEV_11";
        const device = await Device.findOne({ device_uid: devUid });

        console.log("==================================================");
        console.log("🧹 PURGING ALL EXPIRED & DUPLICATE TEST ALERTS FOR DEV_11");
        console.log("==================================================");

        // Delete all EXPIRED alerts for DEV_11
        const expiredDel = await Alert.deleteMany({
            $or: [{ device_uid: "DEV_11" }, { deviceId: "OPULENTMALL-F1-01" }, ...(device ? [{ device: device._id }] : [])],
            $or: [{ status: "EXPIRED" }, { assignmentStatus: "EXPIRED" }]
        });
        console.log(`Deleted ${expiredDel.deletedCount} EXPIRED alerts for DEV_11.`);

        // Keep only 1 latest open/assigned alert for DEV_11, delete any remaining duplicates
        const remainingOpen = await Alert.find({
            $or: [{ device_uid: "DEV_11" }, { deviceId: "OPULENTMALL-F1-01" }, ...(device ? [{ device: device._id }] : [])],
            status: { $in: ["OPEN", "ASSIGNED", "Critical", "Need Attention"] }
        }).sort({ createdAt: -1 });

        console.log(`Remaining open/active alerts for DEV_11: ${remainingOpen.length}`);

        if (remainingOpen.length > 1) {
            const keepId = remainingOpen[0]._id;
            const duplicateIds = remainingOpen.slice(1).map(a => a._id);
            const dupDel = await Alert.deleteMany({ _id: { $in: duplicateIds } });
            console.log(`Kept latest alert ${keepId}, deleted ${dupDel.deletedCount} duplicate open alerts.`);
        }

        const finalCount = await Alert.countDocuments({
            $or: [{ device_uid: "DEV_11" }, { deviceId: "OPULENTMALL-F1-01" }, ...(device ? [{ device: device._id }] : [])]
        });

        console.log(`\n🎉 Cleanup Finished! Total Alert documents in DB for DEV_11 now: ${finalCount}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
