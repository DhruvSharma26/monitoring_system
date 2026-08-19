const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { getAlerts } = require("../controllers/alertController");
        const Alert = require("../models/Alert");
        const Task = require("../models/Task");
        const Device = require("../models/Device");

        const devUid = "DEV_11";
        const device = await Device.findOne({ device_uid: devUid });

        console.log("==================================================");
        console.log("🔍 INSPECTING ALL CARDS & TASKS FOR DEV_11");
        console.log("==================================================");

        // Fetch via controller API
        const reqMock = { user: { id: "6a4cc11050c84e14ea0e8cef", role: "admin" }, query: {} };
        let jsonResult = null;
        const resMock = { status: function() { return this; }, json: function(data) { jsonResult = data; return data; } };

        await getAlerts(reqMock, resMock);

        const dev11Cards = jsonResult.alerts.filter(a => {
            const u = (a.device_uid || a.deviceId || '').toLowerCase();
            return u.includes('dev_11') || u.includes('opulentmall');
        });

        console.log(`Total Cards Returned by getAlerts for DEV_11: ${dev11Cards.length}`);

        dev11Cards.forEach((c, idx) => {
            console.log(`\nCard ${idx + 1}: ID ${c._id} | Status: ${c.status} | AsgnStatus: ${c.assignmentStatus} | CreatedAt: ${c.createdAt} | Description: ${c.description || c.title}`);
        });

        const rawAlerts = await Alert.find({ $or: [{ device_uid: "DEV_11" }, { deviceId: "OPULENTMALL-F1-01" }, { device: device._id }] });
        const rawTasks = await Task.find({ $or: [{ device_uid: "DEV_11" }, { deviceId: "OPULENTMALL-F1-01" }, { device: device._id }] });

        console.log(`\nDB Raw Alert Documents Count: ${rawAlerts.length}`);
        console.log(`DB Raw Task Documents Count: ${rawTasks.length}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
