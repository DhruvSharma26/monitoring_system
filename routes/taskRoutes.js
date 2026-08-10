const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { upload } = require("../services/storageService");

const {
    assignTask,
    getMyTasks,
    getAllTasksForAdmin,
    getTaskTimeline,
    startTask,
    uploadTaskPhotos,
    submitTask,
    verifyTask,
    rejectTask,
    reassignTask,
    completeTask,
    updateTaskProgress
} = require("../controllers/taskController");

// All routes require auth
router.use(authMiddleware);

// Admin Assign Task
router.post("/assign", assignTask);

// Staff Get My Tasks
router.get("/my-tasks", getMyTasks);
router.get("/my-tasks/:staffId", getMyTasks);

// Admin Get All Tasks & Live Progress
router.get("/all", getAllTasksForAdmin);

// Get Task Audit Timeline
router.get("/:taskId/timeline", getTaskTimeline);

// Staff Start Task
router.post("/:taskId/start", startTask);

// Staff Upload Cleaning Photos (Accepts array of 3 to 5 images)
const handlePhotoUpload = (req, res, next) => {
    upload.array("photos", 5)(req, res, (err) => {
        if (err) {
            console.error("❌ Task Photo Upload Middleware Error:", err);
            return res.status(400).json({
                success: false,
                message: err.message || "Failed to upload task photos to server."
            });
        }
        next();
    });
};

router.post("/:taskId/upload-photos", handlePhotoUpload, uploadTaskPhotos);

// Staff Submit Task (Requires >= 10 mins elapsed)
router.post("/submit", submitTask);
router.post("/:taskId/submit", submitTask);

// Admin Verify Task
router.post("/verify", verifyTask);
router.post("/:taskId/verify", verifyTask);

// Admin Reject & Reassign Task
router.post("/reject", rejectTask);
router.post("/:taskId/reject", rejectTask);
router.post("/reassign", reassignTask);
router.post("/:taskId/reassign", reassignTask);

router.post("/:taskId/complete", completeTask);
router.patch("/:taskId/progress", updateTaskProgress);

module.exports = router;