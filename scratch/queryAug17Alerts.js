const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");
require("dotenv").config();

const Alert = require("../models/Alert");
const Task = require("../models/Task");
const Device = require("../models/Device");
const User = require("../models/User");
const { getAlerts } = require("../controllers/alertController");

async function checkAug17Alerts() {
    try {
        console.log("==================================================");
        console.log("🔍 QUERYING MONGODB ATLAS FOR 17 AUGUST ALERTS");
        console.log("==================================================");

        const baseUri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net";
        
        for (const dbName of ["test", "sensordb"]) {
            console.log(`\n==================================================`);
            console.log(`📂 CHECKING DATABASE: "${dbName}"`);
            console.log(`==================================================`);

            if (mongoose.connection.readyState !== 0) {
                await mongoose.disconnect();
            }

            const dbUri = `${baseUri}/${dbName}?retryWrites=true&w=majority&appName=Cluster0`;
            await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 15000 });
            console.log(`✅ Connected to DB: ${dbName}`);

            // 1. Total Overview
            const totalAlertsCount = await Alert.countDocuments();
            const totalTasksCount = await Task.countDocuments();
            const totalDevicesCount = await Device.countDocuments();
            const totalUsersCount = await User.countDocuments();

            console.log(`\n📊 DB Stats for "${dbName}":`);
            console.log(`   - Devices: ${totalDevicesCount}`);
            console.log(`   - Users:   ${totalUsersCount}`);
            console.log(`   - Alerts:  ${totalAlertsCount}`);
            console.log(`   - Tasks:   ${totalTasksCount}`);

            if (totalAlertsCount === 0 && totalTasksCount === 0 && totalDevicesCount === 0) {
                console.log(`ℹ️ Database "${dbName}" is empty, skipping detailed query.`);
                continue;
            }

            // Date ranges for August 17, 2026 (IST timezone UTC+5:30)
            const aug17Start = new Date("2026-08-16T18:30:00.000Z");
            const aug17End   = new Date("2026-08-17T18:29:59.999Z");

            // 2. Query Alert collection for Aug 17, 2026
            const aug17Alerts = await Alert.find({
                $or: [
                    { createdAt: { $gte: aug17Start, $lte: aug17End } },
                    { updatedAt: { $gte: aug17Start, $lte: aug17End } },
                    { resolvedAt: { $gte: aug17Start, $lte: aug17End } }
                ]
            }).lean();

            console.log(`\n🚨 Alert documents created/updated/resolved on 17 August 2026: ${aug17Alerts.length}`);
            aug17Alerts.forEach((a, idx) => {
                console.log(`   [${idx + 1}] ID: ${a._id} | Device: ${a.device_uid || a.deviceId} | Category: ${a.alertCategory || a.alertType} | Status: ${a.status} | CreatedAt: ${a.createdAt}`);
            });

            // 3. Breakdown of ALL alerts in Database by Date
            const allAlerts = await Alert.find().sort({ createdAt: -1 }).lean();
            console.log(`\n📅 Date Breakdown of ALL ${allAlerts.length} Alerts in DB "${dbName}" (Date → Count):`);

            const dateCounts = {};
            allAlerts.forEach(a => {
                if (a.createdAt) {
                    const dateStr = new Date(a.createdAt).toISOString().split('T')[0];
                    dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
                }
            });
            console.log(JSON.stringify(dateCounts, null, 2));

            if (allAlerts.length > 0) {
                console.log(`\n📌 Sample 10 Most Recent Alerts in DB "${dbName}":`);
                allAlerts.slice(0, 10).forEach((a, idx) => {
                    console.log(`   [${idx + 1}] ID: ${a._id} | Device: ${a.device_uid || a.deviceId} | Category: ${a.alertCategory || a.alertType} | Status: ${a.status} | CreatedAt: ${a.createdAt} | UpdatedAt: ${a.updatedAt}`);
                });
            }

            // 4. Test Admin getAlerts Controller API for all Admin users
            const adminUsers = await User.find({ role: "admin" }).lean();
            console.log(`\n👤 Testing Admin Side API Response for ${adminUsers.length} Admin User(s) in "${dbName}":`);

            for (const admin of adminUsers) {
                console.log(`\n--- Admin User: ${admin.name || admin.email} (_id: ${admin._id}) ---`);
                
                const reqMock = {
                    user: { id: admin._id.toString(), role: "admin" },
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

                if (jsonResult && jsonResult.alerts) {
                    console.log(`Total Admin Side Alerts Returned by API: ${jsonResult.alerts.length}`);
                    
                    const aug17AdminAlerts = jsonResult.alerts.filter(a => {
                        const dt = a.createdAt || a.timestamp;
                        if (!dt) return false;
                        const d = new Date(dt);
                        return d >= aug17Start && d <= aug17End;
                    });

                    console.log(`17 August 2026 Alerts present in Admin Side API response: ${aug17AdminAlerts.length}`);
                    jsonResult.alerts.forEach((a, idx) => {
                        console.log(`   [Card ${idx + 1}] ID: ${a._id} | Device: ${a.device_uid || a.deviceId} | Category: ${a.alertCategory || a.category} | Status: ${a.status} | CreatedAt/Timestamp: ${a.createdAt || a.timestamp}`);
                    });
                } else {
                    console.log("No response or empty alerts array.");
                }
            }
        }

        console.log("\n==================================================");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error querying MongoDB Atlas:", err);
        process.exit(1);
    }
}

checkAug17Alerts();
