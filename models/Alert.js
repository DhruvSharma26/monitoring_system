const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
{
    device_uid: {
        type: String,
        required: true
    },

    deviceId: {
        type: String
    },

    device: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device"
    },

    alertCategory: {
        type: String,
        enum: ["Need Attention", "Critical"],
        required: true
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
        type: String
    },

    rating: Number,

    toiletStatus: {
        type: String,
        enum: ["CLEAN", "NEEDS_ATTENTION", "CRITICAL"]
    },

    description: {
        type: String,
        required: true
    },

    feedback: Number,
    Counter: Number,
    OdorSensVal: Number,

    // Audit fields for historical retention
    counterThreshold: Number,
    odorThreshold: Number,
    counterValue: Number,
    odorValue: Number,
    feedbackValue: Number,

    counterSeverity: String,
    odorSeverity: String,
    feedbackSeverity: String,

    triggeredValues: [String],

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

module.exports = mongoose.model("Alert", alertSchema);
