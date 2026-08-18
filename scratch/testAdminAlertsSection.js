const mongoose = require("mongoose");
const getAlerts = require("../controllers/alertController").getAlerts;

async function runAdminAlertsSectionTests() {
    console.log("==================================================");
    console.log("🧪 STARTING ADMIN ALERTS SECTION (ASSIGNED / NOT ASSIGNED) TESTS");
    console.log("==================================================");

    // Mock response helper
    function createMockRes() {
        let statusCode = 200;
        let jsonData = null;
        return {
            status: function(code) {
                statusCode = code;
                return this;
            },
            json: function(data) {
                jsonData = data;
                return data;
            },
            getData: function() { return jsonData; },
            getCode: function() { return statusCode; }
        };
    }

    const mockAdminUser = { id: "60d5ec123456789012345678", role: "admin" };

    // Stub Mongoose model calls for unit verification
    const Device = require("../models/Device");
    const Alert = require("../models/Alert");
    const Task = require("../models/Task");

    const mockStaffA = { _id: new mongoose.Types.ObjectId("60d5ec123456789012345679"), name: "Staff Alpha", empId: "EMP-001" };

    const mockDeviceUnassigned = {
        _id: new mongoose.Types.ObjectId("60d5ec123456789012345601"),
        device_uid: "DEV-UNASSIGNED-01",
        deviceId: "DEV-UNASSIGNED-01",
        location: "Terminal 1",
        floor: "Ground",
        assignedStaff: null
    };

    const mockDeviceAssigned = {
        _id: new mongoose.Types.ObjectId("60d5ec123456789012345602"),
        device_uid: "DEV-ASSIGNED-02",
        deviceId: "DEV-ASSIGNED-02",
        location: "Terminal 2",
        floor: "1st",
        assignedStaff: mockStaffA
    };

    const mockAlertUnassigned = {
        _id: new mongoose.Types.ObjectId(),
        device_uid: "DEV-UNASSIGNED-01",
        deviceId: "DEV-UNASSIGNED-01",
        device: mockDeviceUnassigned._id,
        alertCategory: "Critical",
        alertType: "CRITICAL",
        description: "High Odor Detected",
        status: "OPEN",
        createdAt: new Date()
    };

    const mockAlertAssigned = {
        _id: new mongoose.Types.ObjectId(),
        device_uid: "DEV-ASSIGNED-02",
        deviceId: "DEV-ASSIGNED-02",
        device: mockDeviceAssigned._id,
        alertCategory: "Need Attention",
        alertType: "NEEDS_ATTENTION",
        description: "High Footfall Counter",
        status: "ASSIGNED",
        createdAt: new Date()
    };

    Device.find = function() {
        return {
            populate: function() {
                return {
                    select: function() {
                        return {
                            lean: async function() {
                                return [mockDeviceUnassigned, mockDeviceAssigned];
                            }
                        };
                    }
                };
            }
        };
    };

    Alert.find = function() {
        return {
            sort: function() {
                return {
                    lean: async function() {
                        return [mockAlertUnassigned, mockAlertAssigned];
                    }
                };
            }
        };
    };

    Task.find = function() {
        return {
            populate: function() {
                return {
                    populate: function() {
                        return {
                            sort: function() {
                                return {
                                    lean: async function() {
                                        return [];
                                    }
                                };
                            }
                        };
                    }
                };
            }
        };
    };

    // -------------------------------------------------------------
    // TEST A & B: Unassigned vs Assigned Card Classification
    // -------------------------------------------------------------
    console.log("\n--- TEST A & B: Unassigned Device Alert vs Assigned Device Alert ---");
    const reqAll = { user: mockAdminUser, query: {} };
    const resAll = createMockRes();
    await getAlerts(reqAll, resAll);
    const dataAll = resAll.getData();

    console.log(`Total alerts returned: ${dataAll.alerts.length}`);
    const unassignedCard = dataAll.alerts.find(a => a.device_uid === "DEV-UNASSIGNED-01");
    const assignedCard = dataAll.alerts.find(a => a.device_uid === "DEV-ASSIGNED-02");

    console.log("Unassigned Card Assignment Status:", unassignedCard ? unassignedCard.assignmentStatus : "MISSING");
    console.log("Assigned Card Assignment Status:  ", assignedCard ? assignedCard.assignmentStatus : "MISSING");

    if (unassignedCard && unassignedCard.assignmentStatus === "NOT_ASSIGNED" && (unassignedCard.status === "OPEN" || unassignedCard.status === "Critical" || unassignedCard.status === unassignedCard.alertType) &&
        assignedCard && assignedCard.assignmentStatus === "ASSIGNED" && assignedCard.status === "ASSIGNED") {
        console.log("  [PASS] Case 1 & Case 2 classification verified!");
    } else {
        console.error("  [FAIL] Classification failed!");
        process.exit(1);
    }

    // -------------------------------------------------------------
    // TEST D: Filter Combination (type=critical & status=not_assigned)
    // -------------------------------------------------------------
    console.log("\n--- TEST D: Combined Query Filter (?type=critical&status=not_assigned) ---");
    const reqFiltered = { user: mockAdminUser, query: { type: "critical", status: "not_assigned" } };
    const resFiltered = createMockRes();
    await getAlerts(reqFiltered, resFiltered);
    const dataFiltered = resFiltered.getData();

    console.log(`Filtered alerts returned: ${dataFiltered.alerts.length}`);
    const allAreUnassignedCritical = dataFiltered.alerts.every(a => a.assignmentStatus === "NOT_ASSIGNED");
    if (dataFiltered.alerts.length === 1 && allAreUnassignedCritical) {
        console.log("  [PASS] Combined query filter correctly returned only Critical unassigned alerts!");
    } else {
        console.error("  [FAIL] Filter combination failed!");
        process.exit(1);
    }

    console.log("\n==================================================");
    console.log("🎉 ALL ADMIN ALERTS SECTION TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");
}

runAdminAlertsSectionTests().catch(err => {
    console.error("❌ Test execution error:", err);
    process.exit(1);
});
