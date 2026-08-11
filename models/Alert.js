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
            "NEEDS_ATTENTION",
            "CRITICAL",
            "HIGH_USAGE",
            "HIGH_ODOR",
            "CRITICAL_FEEDBACK",
            "WARNING_FEEDBACK"
        ]
    },

    alertSubtype: {
        type: String,
        enum: ["NA_1", "NA_2", "NA_3", "C_1", "C_2", "C_3", "C_4"]
    },

    rating: Number,

    toiletStatus: {
        type: String,
        enum: ["CLEAN", "NEEDS_ATTENTION", "CRITICAL"]
    },

    description: String,

    feedback: Number,

    Counter: Number,

    OdorSensVal: Number,

    status: {
        type: String,
        enum: [
            "OPEN",
            "ASSIGNED",
            "IN_PROGRESS",
            "REJECTED",
            "VERIFIED",
            "RESOLVED"
        ],
        default: "OPEN"
    },

    resolvedAt: Date
},
{
    timestamps: true
});

module.exports =
mongoose.model(
    "Alert",
    alertSchema
);