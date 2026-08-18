const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { getAlerts } = require("../controllers/alertController");
        const alertService = require("../services/alertService");
        const Device = require("../models/Device");
        const Alert = require("../models/Alert");
        const Task = require("../models/Task");

        const devUid = "DEV_EXPIRE_TEST_99";
        let device = await Device.findOne({ device_uid: devUid });
        if (!device) {
            device = await Device.create({
                device_uid: devUid,
                deviceId: devUid,
                location: "Test Location",
                locationName: "Test Location",
                adminId: new mongoose.Types.ObjectId("6a4cc11050c84e14ea0e8cef")
            });
        }

        // Clear any old alerts for this test device
        await Alert.deleteMany({ device_uid: devUid });
        await Task.deleteMany({ device: device._id });

        // Create a mock Critical alert from YESTERDAY
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const oldCriticalAlert = await Alert.create({
            device_uid: devUid,
            deviceId: device.deviceId,
            device: device._id,
            alertCategory: "Critical",
            alertType: "Critical",
            description: "Yesterday Critical Alert",
            status: "OPEN"
        });

        // Set createdAt to yesterday using raw driver collection update
        await Alert.collection.updateOne({ _id: oldCriticalAlert._id }, { $set: { createdAt: yesterday, updatedAt: yesterday } });

        // Trigger a new alert TODAY to trigger expiration of yesterday's alert
        await alertService.processOrCreateDeviceAlert({
            device_uid: devUid,
            deviceId: device.deviceId,
            alertCategory: "Critical",
            alertType: "Critical",
            description: "New Alert Today",
            Counter: 200,
            OdorSensVal: 60,
            feedback: 2
        });

        // Fetch alerts via API controller
        const reqMock = { user: { id: "6a4cc11050c84e14ea0e8cef", role: "admin" }, query: {} };
        let jsonResult = null;
        const resMock = { status: function() { return this; }, json: function(data) { jsonResult = data; return data; } };

        await getAlerts(reqMock, resMock);

        const expiredCard = jsonResult.alerts.find(a => String(a._id) === String(oldCriticalAlert._id));

        console.log("==================================================");
        console.log("🔍 INSPECTING EXPIRED CARD DATA STRUCTURE:");
        console.log("==================================================");
        console.log(JSON.stringify({
            _id: expiredCard._id,
            status: expiredCard.status,
            isExpired: expiredCard.isExpired,
            alertCategory: expiredCard.alertCategory,
            alertType: expiredCard.alertType,
            category: expiredCard.category,
            type: expiredCard.type,
            originalStatus: expiredCard.originalStatus,
            expiredAlertType: expiredCard.expiredAlertType,
            remarks: expiredCard.remarks
        }, null, 2));

        if (expiredCard.status === "EXPIRED" && expiredCard.alertCategory === "Critical" && expiredCard.expiredAlertType === "Critical") {
            console.log("\n  [PASS] Expired card preserves original alertCategory ('Critical') alongside status 'EXPIRED'!");
        } else {
            console.error("\n  [FAIL] Category preservation failed!");
            process.exit(1);
        }

        // Cleanup
        await Device.deleteOne({ _id: device._id });
        await Alert.deleteMany({ device_uid: devUid });
        await Task.deleteMany({ device: device._id });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
