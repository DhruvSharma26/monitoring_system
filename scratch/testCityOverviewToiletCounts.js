const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { getToilets } = require("../controllers/toiletDashboardController");
        const { getDashboard } = require("../controllers/dashboardController");
        const adminIdVal = "6a4cc11050c84e14ea0e8cef"; // astikasinha937@gmail.com

        const reqMock = { user: { id: adminIdVal, role: "admin" }, query: {} };

        let toiletsRes = null;
        const resMock1 = { status: function() { return this; }, json: function(data) { toiletsRes = data; return data; } };
        await getToilets(reqMock, resMock1);

        let dashboardRes = null;
        const resMock2 = { status: function() { return this; }, json: function(data) { dashboardRes = data; return data; } };
        await getDashboard(reqMock, resMock2);

        console.log("==================================================");
        console.log("🔍 COMPARING STATUS COUNTS FROM TOILET SCREEN VS CITY OVERVIEW DASHBOARD:");
        console.log("==================================================");

        console.log("\n1. Toilet Screen (getToilets):");
        console.log(`   Total Toilets: ${toiletsRes.toilets ? toiletsRes.toilets.length : 0}`);
        const toiletCounts = { Clean: 0, "Need Attention": 0, Critical: 0 };
        (toiletsRes.toilets || []).forEach(t => {
            console.log(`   - Device: ${t.deviceId} (${t.device_uid}) | Status: ${t.status}`);
            const st = (t.status || 'Clean').trim();
            if (st === 'Critical') toiletCounts.Critical++;
            else if (st === 'Need Attention' || st === 'Warning') toiletCounts['Need Attention']++;
            else toiletCounts.Clean++;
        });
        console.log(`   Summary Counts => Clean: ${toiletCounts.Clean}, Need Attention: ${toiletCounts['Need Attention']}, Critical: ${toiletCounts.Critical}`);

        console.log("\n2. City Overview Dashboard (getDashboard):");
        console.log(`   Total Toilets: ${dashboardRes.totalToilets}`);
        console.log(`   Clean: ${dashboardRes.cleanToilets}`);
        console.log(`   Need Attention: ${dashboardRes.attentionToilets}`);
        console.log(`   Critical: ${dashboardRes.criticalToilets}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
