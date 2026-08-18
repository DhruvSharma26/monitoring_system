const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const Alert = require("../models/Alert");
        const alertIds = [
            "6a76cd2bda03ceca4a1ef875",
            "6a76cc1cda03ceca4a1ef626",
            "6a76cb0cda03ceca4a1ef39e"
        ];

        const alerts = await Alert.find({ _id: { $in: alertIds } }).lean();

        console.log(`Linked Alert Documents found in DB: ${alerts.length}`);
        alerts.forEach((a, i) => {
            console.log(`\nAlert [${i + 1}]:`);
            console.log(`  - Alert ID:    ${a._id}`);
            console.log(`  - Device:      ${a.device_uid || a.deviceId}`);
            console.log(`  - Status:      ${a.status}`);
            console.log(`  - Category:    ${a.alertCategory || a.alertType}`);
            console.log(`  - CreatedAt:   ${a.createdAt}`);
            console.log(`  - UpdatedAt:   ${a.updatedAt}`);
            console.log(`  - ResolvedAt:  ${a.resolvedAt}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
