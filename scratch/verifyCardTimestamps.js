const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { getAlerts } = require("../controllers/alertController");
        const adminIdVal = "6a4cc11050c84e14ea0e8cef"; // astikasinha937@gmail.com

        const reqMock = { user: { id: adminIdVal, role: "admin" }, query: {} };
        let jsonResult = null;
        const resMock = { status: function() { return this; }, json: function(data) { jsonResult = data; return data; } };
        
        await getAlerts(reqMock, resMock);

        // Sort by latest timestamp (updatedAt || assignedAt || createdAt)
        const sortedAlerts = jsonResult.alerts.sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.timestamp || a.assignedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.updatedAt || b.timestamp || b.assignedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        console.log("==================================================");
        console.log("🔍 TOP 10 ALERTS WHEN SORTED BY LATEST (updatedAt || createdAt):");
        console.log("==================================================");

        sortedAlerts.slice(0, 10).forEach((a, i) => {
            const created = new Date(a.createdAt);
            const updated = new Date(a.updatedAt || a.createdAt);
            console.log(`[Card ${i + 1}] ID: ${a._id} | Device: ${a.device_uid || a.deviceId} | status: ${a.status}`);
            console.log(`          createdAt: ${created.toDateString()} ${created.toLocaleTimeString()}`);
            console.log(`          updatedAt: ${updated.toDateString()} ${updated.toLocaleTimeString()}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
