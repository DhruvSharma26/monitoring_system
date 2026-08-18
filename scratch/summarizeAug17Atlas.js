const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);
        console.log("Connected to MongoDB Atlas 'test' database.");

        const Alert = require("../models/Alert");
        const Task = require("../models/Task");
        const Device = require("../models/Device");
        const User = require("../models/User");

        const allAlerts = await Alert.find().sort({ createdAt: -1 }).lean();
        console.log(`\nTotal Alerts in 'test' DB: ${allAlerts.length}`);

        const dateCounts = {};
        allAlerts.forEach(a => {
            if (a.createdAt) {
                const dateStr = new Date(a.createdAt).toISOString().split('T')[0];
                dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
            }
        });

        console.log("\n📅 Alerts Count grouped by Date (YYYY-MM-DD UTC):");
        console.log(JSON.stringify(dateCounts, null, 2));

        // Search specifically for 17 August 2026 & 17 August 2025
        const aug17_2026_alerts = allAlerts.filter(a => {
            const d = new Date(a.createdAt || a.updatedAt);
            return d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 17; // Month is 0-indexed (7 = Aug)
        });

        const aug17_2025_alerts = allAlerts.filter(a => {
            const d = new Date(a.createdAt || a.updatedAt);
            return d.getFullYear() === 2025 && d.getMonth() === 7 && d.getDate() === 17;
        });

        console.log(`\n🚨 August 17, 2026 Alerts Count in DB: ${aug17_2026_alerts.length}`);
        aug17_2026_alerts.forEach((a, i) => {
            console.log(`   [${i + 1}] ID: ${a._id} | Device: ${a.device_uid || a.deviceId} | Category: ${a.alertCategory} | Status: ${a.status} | CreatedAt: ${a.createdAt}`);
        });

        console.log(`\n🚨 August 17, 2025 Alerts Count in DB: ${aug17_2025_alerts.length}`);
        aug17_2025_alerts.forEach((i) => {});

        // Check recent dates (Aug 15, 16, 17, 18 2026)
        const recentAlerts = allAlerts.filter(a => {
            const d = new Date(a.createdAt || a.updatedAt);
            return d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() >= 14 && d.getDate() <= 18;
        });

        console.log(`\n🚨 Alerts around Mid-August 2026 (Aug 14 - Aug 18): ${recentAlerts.length}`);
        recentAlerts.forEach((a, i) => {
            console.log(`   [${i + 1}] ID: ${a._id} | Device: ${a.device_uid || a.deviceId} | Category: ${a.alertCategory} | Status: ${a.status} | CreatedAt: ${a.createdAt}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
