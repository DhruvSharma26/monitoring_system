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

        const dev11Alert = jsonResult.alerts.find(a => 
            (a.device_uid && a.device_uid.toLowerCase() === "dev_11") ||
            (a.deviceId && (a.deviceId.toLowerCase() === "dev_11" || a.deviceId.toLowerCase() === "opulentmall-f1-01"))
        );

        console.log("==================================================");
        console.log("🔍 FULL JSON CARD STRUCTURE FOR DEV_11 OPEN ALERT:");
        console.log("==================================================");
        console.log(JSON.stringify(dev11Alert, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
