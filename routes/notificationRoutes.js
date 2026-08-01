const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
    updateFcmToken,
    getUserNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
} = require("../controllers/notificationController");

// All routes require authentication
router.use(authMiddleware);

// Save / Update FCM Token
router.post("/fcm-token", updateFcmToken);

// Get User Notifications
router.get("/", getUserNotifications);

// Mark All as Read
router.patch("/read-all", markAllAsRead);

// Mark Single Notification as Read
router.patch("/:id/read", markAsRead);

// Delete Notification
router.delete("/:id", deleteNotification);

module.exports = router;
