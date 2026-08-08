const Notification = require("../models/Notification");
const User = require("../models/User");

// Register or update FCM device token for logged-in user
const updateFcmToken = async (req, res, next) => {
    try {
        const { fcmToken } = req.body;

        if (!fcmToken) {
            return res.status(400).json({
                success: false,
                message: "fcmToken is required"
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Disambiguate token: remove this FCM token from any other user accounts
        await User.updateMany(
            { _id: { $ne: req.user.id }, $or: [{ fcmToken: fcmToken }, { fcmTokens: fcmToken }] },
            { $unset: { fcmToken: "" }, $pull: { fcmTokens: fcmToken } }
        );

        user.fcmToken = fcmToken;
        
        // Also maintain array of unique tokens
        if (!user.fcmTokens) user.fcmTokens = [];
        if (!user.fcmTokens.includes(fcmToken)) {
            user.fcmTokens.push(fcmToken);
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: "FCM token updated successfully"
        });
    } catch (error) {
        next(error);
    }
};

// Get notifications for logged-in user
const getUserNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const total = await Notification.countDocuments({ recipient: userId });
        const unreadCount = await Notification.countDocuments({ recipient: userId, read: false });

        const notifications = await Notification.find({ recipient: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("device", "deviceId location floor")
            .populate("alert", "alertType feedback status")
            .lean();

        res.status(200).json({
            success: true,
            total,
            unreadCount,
            page,
            pages: Math.ceil(total / limit),
            notifications
        });
    } catch (error) {
        next(error);
    }
};

// Mark single notification as read
const markAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findOne({
            _id: id,
            recipient: req.user.id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }

        notification.read = true;
        await notification.save();

        res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification
        });
    } catch (error) {
        next(error);
    }
};

// Mark all notifications as read for logged-in user
const markAllAsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;

        await Notification.updateMany(
            { recipient: userId, read: false },
            { $set: { read: true } }
        );

        res.status(200).json({
            success: true,
            message: "All notifications marked as read"
        });
    } catch (error) {
        next(error);
    }
};

// Delete notification
const deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findOneAndDelete({
            _id: id,
            recipient: req.user.id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Notification deleted"
        });
    } catch (error) {
        next(error);
    }
};

// Clear all notifications for logged-in user
const deleteAllNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;

        await Notification.deleteMany({ recipient: userId });

        res.status(200).json({
            success: true,
            message: "All notifications cleared"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    updateFcmToken,
    getUserNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications
};
