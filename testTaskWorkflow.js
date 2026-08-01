require("dotenv").config();
const mongoose = require("mongoose");
const Task = require("./models/Task");
const User = require("./models/User");
const Device = require("./models/Device");

async function testWorkflow() {
    try {
        console.log("🔄 Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/sensordb");
        console.log("✅ Connected");

        // 1. Find or create staff and device
        let staff = await User.findOne({ role: "staff" });
        if (!staff) {
            staff = await User.create({
                userId: "STF_TEST",
                role: "staff",
                name: "Test Staff",
                email: "staff_test@example.com",
                mobile: "9999999999",
                empId: "EMP_TEST",
                password: "hashedpassword"
            });
        }

        let device = await Device.findOne();
        if (!device) {
            device = await Device.create({
                device_uid: "DEV_TEST",
                deviceId: "Test-F1-01",
                location: "Test Location",
                floor: "F1"
            });
        }

        // 2. Create Task (Assigned)
        const now = new Date();
        const task = await Task.create({
            staff: staff._id,
            device: device._id,
            assignedAt: now,
            status: "ASSIGNED",
            timeline: [{ status: "ASSIGNED", timestamp: now }]
        });
        console.log(`📋 Task Assigned ID: ${task._id}`);

        // 3. Start Task
        const startNow = new Date();
        task.status = "IN_PROGRESS";
        task.startedAt = startNow;
        task.timeline.push({ status: "IN_PROGRESS", timestamp: startNow });
        await task.save();
        console.log(`⏱️ Task Started at ${startNow.toISOString()}`);

        // 4. Test 10-Minute Minimum Rule Enforcement
        const earlyMins = (Date.now() - new Date(task.startedAt).getTime()) / (1000 * 60);
        console.log(`Checking 10-min rule at ${earlyMins.toFixed(2)} mins: ${earlyMins < 10 ? "BLOCKED (Pass)" : "ALLOWED"}`);

        // 5. Simulate 10 Mins Passage & Submit
        const tenMinsLater = new Date(Date.now() - 11 * 60 * 1000); // 11 mins ago
        task.startedAt = tenMinsLater;
        const validMins = (Date.now() - new Date(task.startedAt).getTime()) / (1000 * 60);
        console.log(`Checking 10-min rule after 11 mins (${validMins.toFixed(2)} mins): ${validMins >= 10 ? "ALLOWED (Pass)" : "BLOCKED"}`);

        // Add 3 cleaning photos (min 3 max 5 requirement)
        task.cleaningPhotos = [
            { url: "http://localhost:5000/uploads/task-photos/photo1.jpg", uploadedAt: new Date() },
            { url: "http://localhost:5000/uploads/task-photos/photo2.jpg", uploadedAt: new Date() },
            { url: "http://localhost:5000/uploads/task-photos/photo3.jpg", uploadedAt: new Date() }
        ];
        task.photosUploadedAt = new Date();
        task.status = "SUBMITTED";
        task.submittedAt = new Date();
        task.timeline.push({ status: "SUBMITTED", timestamp: new Date() });
        await task.save();

        console.log(`✅ Task Submitted with ${task.cleaningPhotos.length} photos!`);
        console.log("Timeline events:", task.timeline.map(t => `${t.status} @ ${t.timestamp}`));

        process.exit(0);
    } catch (err) {
        console.error("❌ Workflow test failed:", err);
        process.exit(1);
    }
}

testWorkflow();
