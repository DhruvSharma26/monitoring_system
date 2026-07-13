const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
{
    alert: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Alert"
    },

    device: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device"
    },

    staff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    status: {
        type: String,
        enum: [
            "ASSIGNED",
            "IN_PROGRESS",
            "SUBMITTED",
            "COMPLETED",
            "PENDING_REVIEW",
            "VERIFIED",
            "RESOLVED"
        ],
        default: "ASSIGNED"
    },

    priority: { type: String, default: "high" },
    est_time: { type: String, default: "15 mins" },
    distance: { type: String, default: "50m" },
    due_time: { type: String, default: "ASAP" },
    completedAt: Date,
    durationMins: Number,
    rating: Number,
    progressPercent: { type: Number, default: 0 },
    notes: String,
    
    beforeCleaningPhoto: String,
    afterCleaningPhoto: String,
    adminRemarks: String,
    verifiedAt: Date
},
{
    timestamps: true
});

module.exports =
mongoose.model(
    "Task",
    taskSchema
);