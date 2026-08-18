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
        console.log("🔍 UNASSIGNED CARDS RETURNED FROM getAlerts:");
        console.log("==================================================");

        console.log(`Total Unassigned Cards: ${result.alerts.length}`);
        const sampleCard = result.alerts[0];
        console.log("Sample Unassigned Card Structure:");
        console.log(JSON.stringify({
            _id: sampleCard._id,
            status: sampleCard.status,
            alertType: sampleCard.alertType,
            alertCategory: sampleCard.alertCategory,
            assignmentStatus: sampleCard.assignmentStatus,
            isAssigned: sampleCard.isAssigned,
            adminRemarks: sampleCard.adminRemarks,
            remarks: sampleCard.remarks,
            description: sampleCard.description
        }, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
