const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
{
    device_uid: {
        type: String,
        required: true
    },

    device: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device"
    },

    alertType: {
        type: String,
        enum: [
            "HIGH_USAGE",
            "HIGH_ODOR",
            "CRITICAL_FEEDBACK",
            "WARNING_FEEDBACK"
        ]
    },

    feedback: Number,

    Counter: Number,

    OdorSensVal: Number,

    status: {
        type: String,
        enum: [
            "OPEN",
            "ASSIGNED",
            "IN_PROGRESS",
            "RESOLVED"
        ],
        default: "OPEN"
    }
},
{
    timestamps: true
});

module.exports =
mongoose.model(
    "Alert",
    alertSchema
);