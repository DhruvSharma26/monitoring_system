const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const Task = require("../models/Task");
        const Alert = require("../models/Alert");
        const Device = require("../models/Device");
        const User = require("../models/User");

        const aug17Tasks = await Task.find({
            createdAt: {
                $gte: new Date("2026-08-16T18:30:00.000Z"),
                $lte: new Date("2026-08-17T18:29:59.999Z")
            }
        })
        .populate("alert")
        .populate("device")
        .populate("staff")
        .populate("assignedBy")
        .lean();

        console.log(`\n📋 Details of 3 Tasks created on 17 August 2026:`);
        aug17Tasks.forEach((t, i) => {
            console.log(`\nTask [${i + 1}]:`);
            console.log(`  - Task ID:    ${t._id}`);
            console.log(`  - Title/Name: ${t.title || t.taskName}`);
            console.log(`  - Device UID: ${t.device_uid || t.deviceId || (t.device ? t.device.device_uid : "N/A")}`);
            console.log(`  - Status:     ${t.status}`);
            console.log(`  - CreatedAt:  ${t.createdAt}`);
            console.log(`  - Alert ID:   ${t.alert ? t.alert._id : "NULL (Synthetic Alert)"}`);
            console.log(`  - Staff:      ${t.staff ? t.staff.name + ' (' + t.staff.email + ')' : "N/A"}`);
            console.log(`  - AssignedBy: ${t.assignedBy ? t.assignedBy.name + ' (' + t.assignedBy.email + ')' : "N/A"}`);
            if (t.device) {
                console.log(`  - Device Admin ID: ${t.device.adminId}`);
            }
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
