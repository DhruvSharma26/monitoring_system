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

router.post("/", auth, assignDevicesToStaff);
router.get("/", auth, getAllAssignments);
router.get("/staff/:staffId", auth, getStaffAssignments);
router.post("/unassign", auth, unassignDevice);
router.post("/reassign", auth, reassignDevice);

module.exports = router;
