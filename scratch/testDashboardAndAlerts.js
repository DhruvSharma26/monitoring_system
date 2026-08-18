const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { getLiveAlerts, getDashboard } = require("../controllers/dashboardController");
        const { getAlerts } = require("../controllers/alertController");
        const adminIdVal = "6a4cc11050c84e14ea0e8cef"; // astikasinha937@gmail.com

        console.log("==================================================");
        console.log("🔍 TESTING DASHBOARD & LIVE ALERTS FOR ADMIN astikasinha937@gmail.com");
        console.log("==================================================");

        // 1. Test getLiveAlerts
        const reqLive = { user: { id: adminIdVal, role: "admin" }, query: {} };
        let liveResult = null;
        const resLive = { status: function() { return this; }, json: function(data) { liveResult = data; return data; } };
        await getLiveAlerts(reqLive, resLive);

        console.log(`\ngetLiveAlerts Returned ${liveResult.alerts.length} Alerts:`);
        const dev11Live = liveResult.alerts.filter(a => 
            (a.device_uid && a.device_uid.toLowerCase() === "dev_11") ||
            (a.deviceId && (a.deviceId.toLowerCase() === "dev_11" || a.deviceId.toLowerCase() === "opulentmall-f1-01"))
        );
        console.log(`Live Alerts for DEV_11: ${dev11Live.length}`);
        dev11Live.forEach(a => console.log(`   - ID: ${a._id} | status: ${a.status} | device_uid: ${a.device_uid} | deviceId: ${a.deviceId}`));

        // 2. Test getDashboard
        const reqDash = { user: { id: adminIdVal, role: "admin" }, query: {} };
        let dashResult = null;
        const resDash = { status: function() { return this; }, json: function(data) { dashResult = data; return data; } };
        await getDashboard(reqDash, resDash);

        console.log(`\ngetDashboard Summary Stats:`);
        console.log(`   - Total Toilets: ${dashResult.totalToilets || (dashResult.devices ? dashResult.devices.length : 0)}`);
        if (dashResult.liveAlerts) {
            const dev11Dash = dashResult.liveAlerts.filter(a => 
                (a.device_uid && a.device_uid.toLowerCase() === "dev_11") ||
                (a.deviceId && (a.deviceId.toLowerCase() === "dev_11" || a.deviceId.toLowerCase() === "opulentmall-f1-01"))
            );
            console.log(`   - liveAlerts in getDashboard: ${dashResult.liveAlerts.length} | DEV_11 liveAlerts: ${dev11Dash.length}`);
        }

        // 3. Test getAlerts with status=OPEN vs status=NOT_ASSIGNED
        console.log(`\nTesting getAlerts controller for Admin:`);
        for (const st of ["OPEN", "NOT_ASSIGNED", "unassigned", "open", "all"]) {
            const reqAlerts = { user: { id: adminIdVal, role: "admin" }, query: { status: st } };
            let alertsResult = null;
            const resAlerts = { status: function() { return this; }, json: function(data) { alertsResult = data; return data; } };
            await getAlerts(reqAlerts, resAlerts);

            const dev11InSt = alertsResult.alerts.filter(a => 
                (a.device_uid && a.device_uid.toLowerCase() === "dev_11") ||
                (a.deviceId && (a.deviceId.toLowerCase() === "dev_11" || a.deviceId.toLowerCase() === "opulentmall-f1-01"))
            );
            console.log(`   - getAlerts(?status=${st}) returned ${alertsResult.alerts.length} total cards | DEV_11: ${dev11InSt.length}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
