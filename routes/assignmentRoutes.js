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
router.post("/assign", auth, assignDevicesToStaff);
router.post("/create", auth, assignDevicesToStaff);

router.get("/", auth, getAllAssignments);
router.get("/all", auth, getAllAssignments);

router.get("/staff/:staffId", auth, getStaffAssignments);

router.post("/unassign", auth, unassignDevice);
router.post("/remove", auth, unassignDevice);

router.post("/reassign", auth, reassignDevice);
router.post("/update", auth, reassignDevice);

module.exports = router;
