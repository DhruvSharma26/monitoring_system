const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { getAlerts } = require("../controllers/alertController");
        const adminIdVal = "6a4cc11050c84e14ea0e8cef";

        const reqMock = { user: { id: adminIdVal, role: "admin" }, query: { status: "not_assigned" } };
        let result = null;
        const resMock = { status: function() { return this; }, json: function(data) { result = data; return data; } };

        await getAlerts(reqMock, resMock);

        console.log("==================================================");
        console.log("🔍 TESTING UNASSIGNED TAB ALERTS FOR ALERT TYPE AS STATUS:");
        console.log("==================================================");

        console.log(`Total Unassigned Alerts Returned: ${result.alerts.length}`);
        result.alerts.slice(0, 5).forEach((a, i) => {
            console.log(`[Unassigned Card ${i + 1}] ID: ${a._id}`);
            console.log(`   status: "${a.status}" | alertType: "${a.alertType}" | alertCategory: "${a.alertCategory}"`);
            console.log(`   assignmentStatus: "${a.assignmentStatus}" | isAssigned: ${a.isAssigned}`);
            console.log(`   adminRemarks: "${a.adminRemarks || ''}" | remarks: "${a.remarks}"\n`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
