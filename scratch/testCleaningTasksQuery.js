const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const Device = require("../models/Device");
        const Task = require("../models/Task");

        const devUid = "DEV_11";
        const device = await Device.findOne({
            $or: [{ deviceId: devUid }, { device_uid: devUid }]
        }).lean();

        const targetUids = [device.device_uid, device.deviceId, device._id ? device._id.toString() : null].filter(Boolean);
        const regexUids = targetUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

        // Query tasks strictly by device._id vs by regexUids
        const tasksByDevIdOnly = await Task.find({ device: device._id }).lean();
        const tasksByUidRegex = await Task.find({
            $or: [
                { device: device._id },
                { device_uid: { $in: regexUids } },
                { deviceId: { $in: regexUids } }
            ]
        }).lean();

        console.log(`Tasks for DEV_11 by device._id only: ${tasksByDevIdOnly.length}`);
        console.log(`Tasks for DEV_11 by $or regexUids: ${tasksByUidRegex.length}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
