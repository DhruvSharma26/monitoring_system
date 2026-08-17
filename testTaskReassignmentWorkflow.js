require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const Task = require("./models/Task");
const User = require("./models/User");
const Device = require("./models/Device");
const Notification = require("./models/Notification");
const notificationService = require("./services/notificationService");

async function runTests() {
    console.log("==================================================");
    console.log("🧪 STARTING TASK REASSIGNMENT NOTIFICATION TESTS");
    console.log("==================================================");

    let mongoConnected = false;
    try {
        if (mongoose.connection.readyState !== 1 && process.env.MONGO_URI) {
            await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 });
            mongoConnected = true;
            console.log("✅ Connected to MongoDB!");
        }
    } catch (err) {
        console.log("ℹ️ Local MongoDB instance offline — running full Unit Test Mocking.");
    }

    if (!mongoConnected) {
        // Stub Mongoose calls for offline unit testing
        Notification.create = async (data) => ({
            _id: new mongoose.Types.ObjectId(),
            ...data,
            toObject: function() { return { _id: this._id, ...data }; }
        });
        User.find = () => ({
            select: () => ({
                lean: async () => []
            })
        });
    }

    // Mock Users, Device and Task for testing
    const mockStaffA = {
        _id: new mongoose.Types.ObjectId(),
        name: "Staff Alpha",
        email: "staff.a@example.com",
        role: "staff",
        fcmToken: "token_staff_a_123"
    };

    const mockStaffB = {
        _id: new mongoose.Types.ObjectId(),
        name: "Staff Beta",
        email: "staff.b@example.com",
        role: "staff",
        fcmToken: "token_staff_b_456"
    };

    const mockDevice = {
        _id: new mongoose.Types.ObjectId(),
        device_uid: "DEV-TEST-001",
        deviceId: "DEV-TEST-001",
        location: "Building 1 - 2nd Floor"
    };

    const mockTask = {
        _id: new mongoose.Types.ObjectId(),
        taskName: "Restroom Maintenance Task",
        staff: mockStaffA._id,
        device: mockDevice._id,
        alert: new mongoose.Types.ObjectId(),
        timeline: []
    };

    // Track Socket emissions
    const emittedEvents = [];
    global.io = {
        to: (room) => ({
            emit: (event, payload) => {
                emittedEvents.push({ room, event, payload });
            }
        })
    };

    // Test 1: Direct Unit Invocation of sendTaskReassignedNotification
    console.log("\n--- TEST 1: Unit Test sendTaskReassignedNotification ---");
    if (mongoConnected) {
        await User.deleteMany({ email: { $in: [mockStaffA.email, mockStaffB.email] } });
        await User.create(mockStaffA);
        await User.create(mockStaffB);

        await Notification.deleteMany({ recipient: { $in: [mockStaffA._id, mockStaffB._id] } });

        await notificationService.sendTaskReassignedNotification(mockTask, mockStaffA, mockStaffB, mockDevice);

        const notifOld = await Notification.findOne({ recipient: mockStaffA._id, type: "TASK_REASSIGNED_FROM_YOU" });
        const notifNew = await Notification.findOne({ recipient: mockStaffB._id, type: "TASK_REASSIGNED_TO_YOU" });

        if (notifOld && notifNew) {
            console.log("  [PASS] DB Notifications created for both old and new staff.");
            console.log("  Old Staff Notif:", notifOld.title, "|", notifOld.type);
            console.log("  New Staff Notif:", notifNew.title, "|", notifNew.type);
        } else {
            console.error("  [FAIL] Missing DB notification(s).");
            process.exit(1);
        }
    } else {
        await notificationService.sendTaskReassignedNotification(mockTask, mockStaffA, mockStaffB, mockDevice);
        console.log("  [PASS] Unit notification creation executed cleanly.");
    }

    // Test 2: Verify Socket Room Emissions
    console.log("\n--- TEST 2: Targeted Socket.io Room Emission Verification ---");
    const oldStaffRoomEvents = emittedEvents.filter(e => e.room === `user_${mockStaffA._id}`);
    const newStaffRoomEvents = emittedEvents.filter(e => e.room === `user_${mockStaffB._id}`);

    console.log(`  Events sent to old staff room (user_${mockStaffA._id}): ${oldStaffRoomEvents.length}`);
    console.log(`  Events sent to new staff room (user_${mockStaffB._id}): ${newStaffRoomEvents.length}`);

    const oldReassignedEvent = oldStaffRoomEvents.find(e => e.event === "task_reassigned");
    const newReassignedEvent = newStaffRoomEvents.find(e => e.event === "task_reassigned");

    if (oldStaffRoomEvents.length > 0 && newStaffRoomEvents.length > 0 && oldReassignedEvent && newReassignedEvent) {
        console.log("  [PASS] Socket.io notifications correctly targeted to private user rooms.");
        console.log("  Old Staff Socket Payload:", oldReassignedEvent.payload);
        console.log("  New Staff Socket Payload:", newReassignedEvent.payload);
    } else {
        console.error("  [FAIL] Socket.io events not properly targeted.");
        process.exit(1);
    }

    console.log("\n==================================================");
    console.log("🎉 ALL TASK REASSIGNMENT WORKFLOW TESTS PASSED!");
    console.log("==================================================");

    if (mongoConnected) {
        await User.deleteMany({ email: { $in: [mockStaffA.email, mockStaffB.email] } });
        await Notification.deleteMany({ recipient: { $in: [mockStaffA._id, mockStaffB._id] } });
        await mongoose.disconnect();
    }
}

runTests().catch(err => {
    console.error("❌ Test Script Error:", err);
    process.exit(1);
});
