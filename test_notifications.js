require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Device = require("./models/Device");
const Alert = require("./models/Alert");
const Notification = require("./models/Notification");
const { handleMqttAlertNotification } = require("./services/notificationService");

async function runTest() {
    try {
        console.log("🔄 Connecting to Mongo DB...");
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/sensordb");
        console.log("✅ DB Connected");

        // 1. Create or find Admin User
        let admin = await User.findOne({ role: "admin", email: "test_admin@example.com" });
        if (!admin) {
            admin = await User.create({
                userId: "ADM001",
                role: "admin",
                name: "Test Admin",
                email: "test_admin@example.com",
                mobile: "9999999999",
                password: "hashedpassword123",
                fcmToken: "mock_fcm_token_admin_123"
            });
            console.log("👤 Test Admin created");
        }

        // 2. Create or find Staff User
        let staff = await User.findOne({ role: "staff", email: "test_staff@example.com" });
        if (!staff) {
            staff = await User.create({
                userId: "STF001",
                role: "staff",
                name: "Test Staff",
                email: "test_staff@example.com",
                mobile: "8888888888",
                empId: "EMP001",
                password: "hashedpassword123",
                fcmToken: "mock_fcm_token_staff_456"
            });
            console.log("👤 Test Staff created");
        }

        // 3. Create or find Device linked to Admin & Staff
        let device = await Device.findOne({ device_uid: "TEST_DEV_001" });
        if (!device) {
            device = await Device.create({
                device_uid: "TEST_DEV_001",
                deviceId: "TestLoc-F1-01",
                adminId: admin._id,
                assignedStaff: staff._id,
                location: "Test Washroom Block A",
                floor: "1st Floor"
            });
            console.log("📱 Test Device created");
        } else {
            device.adminId = admin._id;
            device.assignedStaff = staff._id;
            await device.save();
        }

        // 4. Simulate Alert Creation from MQTT Payload
        const mockSensorPayload = {
            device_uid: "TEST_DEV_001",
            feedback: 4, // Critical Feedback
            OdorSensVal: 95,
            Counter: 150
        };

        const alert = await Alert.create({
            device_uid: mockSensorPayload.device_uid,
            alertType: "CRITICAL_FEEDBACK",
            feedback: mockSensorPayload.feedback,
            OdorSensVal: mockSensorPayload.OdorSensVal,
            Counter: mockSensorPayload.Counter,
            status: "OPEN"
        });
        console.log(`🚨 Mock Alert created with ID: ${alert._id}`);

        // 5. Trigger Notification Pipeline
        console.log("🚀 Executing handleMqttAlertNotification...");
        await handleMqttAlertNotification(mockSensorPayload, "CRITICAL_FEEDBACK", alert);

        // 6. Check created notifications in MongoDB
        const notifications = await Notification.find({ alert: alert._id }).populate("recipient", "name email role");

        console.log("\n📊 --- TEST RESULTS ---");
        console.log(`Total Notifications Created in DB: ${notifications.length}`);
        notifications.forEach((n, idx) => {
            console.log(`\nNotification #${idx + 1}:`);
            console.log(`- Recipient: ${n.recipient?.name} (${n.recipient?.role})`);
            console.log(`- Title: ${n.title}`);
            console.log(`- Message: ${n.message}`);
            console.log(`- Read Status: ${n.read}`);
        });

        console.log("\n✅ All tests executed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Test failed:", error);
        process.exit(1);
    }
}

runTest();
