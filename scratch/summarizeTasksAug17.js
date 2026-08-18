const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);
        console.log("Connected to MongoDB Atlas 'test' database.");

        const Task = require("../models/Task");
        const allTasks = await Task.find().sort({ createdAt: -1 }).lean();
        console.log(`\nTotal Tasks in 'test' DB: ${allTasks.length}`);

        const dateCounts = {};
        allTasks.forEach(t => {
            if (t.createdAt) {
                const dateStr = new Date(t.createdAt).toISOString().split('T')[0];
                dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
            }
        });

        console.log("\n📅 Tasks Count grouped by Date (YYYY-MM-DD UTC):");
        console.log(JSON.stringify(dateCounts, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
