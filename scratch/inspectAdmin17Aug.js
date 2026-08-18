const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const User = require("../models/User");
        const { getAlerts } = require("../controllers/alertController");

        const adminId = "6a4cc11050c84e14ea0e8cef";
        const adminUser = await User.findById(adminId).lean();
        console.log(`Admin User Details:`, adminUser);

        const reqMock = {
            user: { id: adminId, role: "admin" },
            query: {}
        };
        
        let jsonResult = null;
        const resMock = {
            status: function() { return this; },
            json: function(data) {
                jsonResult = data;
                return data;
            }
        };

        await getAlerts(reqMock, resMock);

        console.log(`\nTotal Alerts returned for Admin ${adminUser ? adminUser.email : adminId}: ${jsonResult.alerts.length}`);
        
        const aug17Cards = jsonResult.alerts.filter(a => {
            const dt = a.createdAt || a.timestamp || a.assignedAt;
            if (!dt) return false;
            const d = new Date(dt);
            return d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 17;
        });

        console.log(`\n🚨 17 August 2026 Alert Cards in Admin UI for ${adminUser ? adminUser.name || adminUser.email : adminId}: ${aug17Cards.length}`);
        aug17Cards.forEach((c, idx) => {
            console.log(`   [Card ${idx + 1}] ID: ${c._id || c.id} | Device: ${c.device_uid || c.deviceId} | Category: ${c.alertCategory || c.category} | Status: ${c.status} | TaskStatus: ${c.taskStatus} | CreatedAt: ${c.createdAt} | Timestamp: ${c.timestamp}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
