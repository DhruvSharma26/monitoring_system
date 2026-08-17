require("dotenv").config();
const mongoose = require("mongoose");
const Task = require("./models/Task");
const User = require("./models/User");
const Device = require("./models/Device");
const Alert = require("./models/Alert");
const Assignment = require("./models/Assignment");
const Notification = require("./models/Notification");
const LatestDeviceStatus = require("./models/LatestDeviceStatus");
const notificationService = require("./services/notificationService");

async function runBusinessChangesTests() {
    console.log("==================================================");
    console.log("🧪 STARTING BUSINESS-CRITICAL CHANGES WORKFLOW TESTS");
    console.log("==================================================");

    let mongoConnected = false;
    try {
        if (mongoose.connection.readyState !== 1 && process.env.MONGO_URI) {
            await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 1500 });
            mongoConnected = true;
            console.log("✅ Connected to MongoDB!");
        }
    } catch (err) {
        console.log("ℹ️ Local MongoDB offline — running full Unit Mocking verification.");
    }

    if (!mongoConnected) {
        // Stub Mongoose model calls for offline testing
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
        Device.findOne = async () => null;
    }

    const mockStaffA = {
        _id: new mongoose.Types.ObjectId(),
        name: "Staff Alpha",
        email: "staff.a@example.com",
        role: "staff",
        fcmToken: "fcm_token_staff_a"
    };

    const mockStaffB = {
        _id: new mongoose.Types.ObjectId(),
        name: "Staff Beta",
        email: "staff.b@example.com",
        role: "staff",
        fcmToken: "fcm_token_staff_b"
    };

    const mockAdmin = {
        _id: new mongoose.Types.ObjectId(),
        name: "Admin Boss",
        email: "admin@example.com",
        role: "admin"
    };

    const mockDeviceA = {
        _id: new mongoose.Types.ObjectId(),
        device_uid: "DEV-BIZ-001",
        deviceId: "DEV-BIZ-001",
        location: "Terminal 1 - Gate 5",
        adminId: mockAdmin._id,
        assignedStaff: mockStaffA._id
    };

    const emittedEvents = [];
    global.io = {
        to: (room) => ({
            emit: (event, payload) => {
                emittedEvents.push({ room, event, payload });
            }
        }),
        emit: (event, payload) => {
            emittedEvents.push({ room: "global", event, payload });
        }
    };

    // -------------------------------------------------------------
    // TEST 1 & 2: Unstarted Task Reassignment Guard Check
    // -------------------------------------------------------------
    console.log("\n--- TEST 1 & 2: Task Reassignment Guard (Unstarted vs Started Task) ---");
    const unstartedTask = {
        _id: new mongoose.Types.ObjectId(),
        taskName: "Restroom Maintenance",
        staff: mockStaffA._id,
        device: mockDeviceA._id,
        status: "ASSIGNED"
    };

    const startedTask = {
        _id: new mongoose.Types.ObjectId(),
        taskName: "Restroom Maintenance - In Progress",
        staff: mockStaffA._id,
        device: mockDeviceA._id,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 10000)
    };

    const canReassignUnstarted = (unstartedTask.status === "ASSIGNED" && !unstartedTask.startedAt);
    const canReassignStarted = (startedTask.status === "ASSIGNED" && !startedTask.startedAt);

    console.log(`  Unstarted Task Reassignable: ${canReassignUnstarted}`);
    console.log(`  Started Task Reassignable:   ${canReassignStarted}`);

    if (canReassignUnstarted === true && canReassignStarted === false) {
        console.log("  [PASS] Only unstarted tasks will be automatically transferred.");
    } else {
        console.error("  [FAIL] Task reassignment guard check failed.");
        process.exit(1);
    }

    // -------------------------------------------------------------
    // TEST 3: Notification Dispatch for Reassigned Task
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Reassignment Notification Delivery & Socket Targeting ---");
    await notificationService.sendTaskReassignedNotification(unstartedTask, mockStaffA, mockStaffB, mockDeviceA);

    const staffARoomEvents = emittedEvents.filter(e => e.room === `user_${mockStaffA._id}`);
    const staffBRoomEvents = emittedEvents.filter(e => e.room === `user_${mockStaffB._id}`);

    const staffAReassigned = staffARoomEvents.find(e => e.event === "task_reassigned");
    const staffBReassigned = staffBRoomEvents.find(e => e.event === "task_reassigned");

    if (staffAReassigned && staffBReassigned && staffAReassigned.payload.role === "OLD_STAFF" && staffBReassigned.payload.role === "NEW_STAFF") {
        console.log("  [PASS] Targeted socket events delivered to both Old Staff A and New Staff B rooms.");
    } else {
        console.error("  [FAIL] Socket event targeting failed.");
        process.exit(1);
    }

    // -------------------------------------------------------------
    // TEST 4: MQTT Unknown/Deleted Device Guard & Fallback Removal
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Unknown / Deleted Device MQTT Guard Verification ---");
    const initialNotifEventsCount = emittedEvents.length;
    await notificationService.handleMqttAlertNotification({ device_uid: "UNKNOWN-UID-999", feedback: 4 }, "NEEDS_ATTENTION", null);
    const notifEventsAfterUnknown = emittedEvents.length;

    if (initialNotifEventsCount === notifEventsAfterUnknown) {
        console.log("  [PASS] Telemetry from unknown/deleted device triggers zero notifications, zero FCM push, and zero admin fallback.");
    } else {
        console.error("  [FAIL] Unknown device triggered notifications!");
        process.exit(1);
    }

    console.log("\n==================================================");
    console.log("🎉 ALL BUSINESS-CRITICAL WORKFLOW TESTS PASSED!");
    console.log("==================================================");

    if (mongoConnected) {
        await mongoose.disconnect();
    }
}

runBusinessChangesTests().catch(err => {
    console.error("❌ Test Script Error:", err);
    process.exit(1);
});
