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
        console.log("🔍 QUERYING DEV_11 IN MONGODB ATLAS");
        console.log("==================================================");

        // 1. Find Device DEV_11
        const device = await Device.findOne({
            $or: [
                { device_uid: /DEV_11/i },
                { deviceId: /DEV_11/i }
            ]
        }).populate("assignedStaff").lean();

        console.log("\n📱 Device Record for DEV_11:");
        if (device) {
            console.log(`   - ID:           ${device._id}`);
            console.log(`   - device_uid:   ${device.device_uid}`);
            console.log(`   - deviceId:     ${device.deviceId}`);
            console.log(`   - location:     ${device.location || device.locationName}`);
            console.log(`   - status:       ${device.status}`);
            console.log(`   - adminId:      ${device.adminId}`);
            console.log(`   - assignedStaff: ${device.assignedStaff ? device.assignedStaff.name + ' (' + device.assignedStaff.email + ')' : "None"}`);
        } else {
            console.log("   ❌ Device DEV_11 not found!");
        }

        // 2. Find all Alerts for DEV_11
        const dev11Alerts = await Alert.find({
            $or: [
                { device_uid: /DEV_11/i },
                { deviceId: /DEV_11/i },
                ...(device ? [{ device: device._id }] : [])
            ]
        }).sort({ createdAt: -1 }).lean();

        console.log(`\n🚨 Total Alert Documents found for DEV_11: ${dev11Alerts.length}`);

        const aug17_2026_dev11_alerts = dev11Alerts.filter(a => {
            const d = new Date(a.createdAt || a.updatedAt);
            return d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 17;
        });

        console.log(`🚨 DEV_11 Alert documents created/updated on 17 August 2026: ${aug17_2026_dev11_alerts.length}`);
        if (aug17_2026_dev11_alerts.length > 0) {
            aug17_2026_dev11_alerts.forEach((a, idx) => {
                console.log(`   [${idx + 1}] ID: ${a._id} | Category: ${a.alertCategory || a.alertType} | Status: ${a.status} | CreatedAt: ${a.createdAt} | UpdatedAt: ${a.updatedAt}`);
            });
        }

        console.log(`\n📌 Sample 10 Most Recent Alerts for DEV_11:`);
        dev11Alerts.slice(0, 10).forEach((a, idx) => {
            console.log(`   [${idx + 1}] ID: ${a._id} | Category: ${a.alertCategory || a.alertType} | Status: ${a.status} | Counter: ${a.Counter} | Odor: ${a.OdorSensVal} | CreatedAt: ${a.createdAt} | UpdatedAt: ${a.updatedAt}`);
        });

        // 3. Find all Tasks for DEV_11
        const dev11Tasks = await Task.find({
            $or: [
                { device_uid: /DEV_11/i },
                { deviceId: /DEV_11/i },
                ...(device ? [{ device: device._id }] : [])
            ]
        }).sort({ createdAt: -1 }).lean();

        console.log(`\n📋 Total Tasks found for DEV_11: ${dev11Tasks.length}`);
        const aug17_2026_dev11_tasks = dev11Tasks.filter(t => {
            const d = new Date(t.createdAt || t.updatedAt || t.assignedAt);
            return d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 17;
        });

        console.log(`📋 DEV_11 Task documents created/updated on 17 August 2026: ${aug17_2026_dev11_tasks.length}`);
        if (aug17_2026_dev11_tasks.length > 0) {
            aug17_2026_dev11_tasks.forEach((t, idx) => {
                console.log(`   [${idx + 1}] ID: ${t._id} | Title: ${t.title || t.taskName} | Status: ${t.status} | CreatedAt: ${t.createdAt} | UpdatedAt: ${t.updatedAt}`);
            });
        }

        if (dev11Tasks.length > 0) {
            console.log(`\n📌 Sample 5 Most Recent Tasks for DEV_11:`);
            dev11Tasks.slice(0, 5).forEach((t, idx) => {
                console.log(`   [${idx + 1}] ID: ${t._id} | Title: ${t.title || t.taskName} | Status: ${t.status} | CreatedAt: ${t.createdAt} | UpdatedAt: ${t.updatedAt}`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
