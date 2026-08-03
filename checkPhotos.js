const mongoose = require("mongoose");
require("dotenv").config();
const Task = require("./models/Task");

async function checkPhotos() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/sensordb");
        console.log("Connected.");

        const tasks = await Task.find({ status: "SUBMITTED" }).populate("device staff").lean();
        console.log(`Found ${tasks.length} submitted tasks:`);
        tasks.forEach(task => {
            console.log(`Task ID: ${task._id}`);
            console.log(`  Device UID: ${task.device ? task.device.device_uid : 'N/A'}`);
            console.log(`  Staff: ${task.staff ? task.staff.name : 'N/A'}`);
            console.log(`  Cleaning Photos:`, task.cleaningPhotos);
        });

        process.exit(0);
    } catch (err) {
        console.error("Error checking tasks:", err);
        process.exit(1);
    }
}

checkPhotos();
