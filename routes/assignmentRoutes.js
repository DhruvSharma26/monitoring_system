const express = require("express");
const router = express.Router();
const {
    assignDevicesToStaff,
    getAllAssignments,
    getStaffAssignments,
    unassignDevice,
    reassignDevice
} = require("../controllers/assignmentController");
const auth = require("../middleware/authMiddleware");

router.post(["/", "/assign", "/create"], auth, assignDevicesToStaff);
router.get(["/", "/all"], auth, getAllAssignments);
router.get("/staff/:staffId", auth, getStaffAssignments);
router.post(["/unassign", "/remove"], auth, unassignDevice);
router.post(["/reassign", "/update"], auth, reassignDevice);

module.exports = router;
