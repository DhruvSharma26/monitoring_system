const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
{
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    recipientRole: {
        type: String,
        enum: ["admin", "staff"],
        required: true
    },

    alert: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Alert"
    },

    device_uid: {
        type: String
    },

    device: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device"
    },

    title: {
        type: String,
        required: true
    },

    message: {
        type: String,
        required: true
    },

    alertType: {
        type: String
    },

    feedback: {
        type: Number
    },

    read: {
        type: Boolean,
        default: false
    },

    type: {
        type: String,
        default: "MQTT_ALERT"
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("Notification", notificationSchema);
