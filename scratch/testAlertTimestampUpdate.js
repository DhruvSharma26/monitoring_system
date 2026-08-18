const mongoose = require("mongoose");
const Alert = require("../models/Alert");
const Device = require("../models/Device");
const Task = require("../models/Task");
const Assignment = require("../models/Assignment");
const { processOrCreateDeviceAlert } = require("../services/alertService");

async function testTimestampUpdate() {
    console.log("==================================================");
    console.log("🧪 TESTING UNASSIGNED ALERT TRIGGER TIMESTAMP UPDATE");
    console.log("==================================================");

    const devUid = "TEST-DEV-TIMESTAMP-UPDATE-01";

    const mockDevice = {
        _id: new mongoose.Types.ObjectId(),
        device_uid: devUid,
        deviceId: devUid,
        location: "Test Location",
        assignedStaff: null
    };

    Device.findOne = async function() { return mockDevice; };
    Task.findOne = async function() { return null; };
    Assignment.findOne = async function() { return null; };

    const initialCreatedAt = new Date(Date.now() - 3600 * 1000); // 1 hour ago

    let storedAlert = null;

    Alert.find = function() {
        return {
            sort: function() {
                return storedAlert ? [storedAlert] : [];
            }
        };
    };

    Alert.create = async function(doc) {
        storedAlert = {
            ...doc,
            _id: new mongoose.Types.ObjectId(),
            createdAt: initialCreatedAt,
            updatedAt: initialCreatedAt,
            save: async function() {
                return this;
            }
        };
        return storedAlert;
    };

    // Step 1: Create initial alert
    console.log("Step 1: Creating initial alert (1 hour ago)...");
    const res1 = await processOrCreateDeviceAlert({
        device_uid: devUid,
        alertCategory: "Need Attention",
        alertType: "NEEDS_ATTENTION",
        description: "Initial alert triggered 1 hour ago",
        Counter: 150
    });

    console.log(`  Initial alert created at: ${res1.alert.createdAt.toISOString()}`);
    console.log(`  Is overwritten: ${res1.isOverwritten}`);

    // Step 2: Simulate new telemetry that updates open unassigned alert now
    console.log("\nStep 2: Updating unassigned alert with new telemetry details...");
    const res2 = await processOrCreateDeviceAlert({
        device_uid: devUid,
        alertCategory: "Critical",
        alertType: "CRITICAL",
        description: "Updated alert with higher counter",
        Counter: 250
    });

    console.log(`  Alert category updated to: ${res2.alert.alertCategory}`);
    console.log(`  Alert counter updated to:  ${res2.alert.Counter}`);
    console.log(`  Is overwritten: ${res2.isOverwritten}`);
    console.log(`  Alert createdAt timestamp: ${res2.alert.createdAt.toISOString()}`);

    if (res2.alert.createdAt.getTime() > initialCreatedAt.getTime()) {
        console.log("\n✅ [PASS] Unassigned alert trigger timestamp (createdAt) was successfully updated to the latest trigger timestamp!");
    } else {
        console.error(`\n❌ [FAIL] Alert trigger timestamp was not updated!`);
        process.exit(1);
    }

    console.log("==================================================");
}

testTimestampUpdate().catch(err => {
    console.error("❌ Test error:", err);
    process.exit(1);
});
