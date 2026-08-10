const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
{
    taskName: { type: String, default: "" },
    title: { type: String, default: "" },
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
    est_time: { type: String, default: "" },
    distance: { type: String, default: "50m" },
    due_time: { type: String, default: "ASAP" },
    assignedAt: { type: Date, default: Date.now },
    startedAt: Date,
    photosUploadedAt: Date,
    submittedAt: Date,
    completedAt: Date,
    durationMins: Number,
    rating: Number,
    progressPercent: { type: Number, default: 0 },
    notes: String,
    
    beforeCleaningPhoto: String,
    afterCleaningPhoto: String,
    cleaningPhotos: [{
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    adminRemarks: String,
    verifiedAt: Date,
    resolvedAt: Date,

    timeline: [{
        status: String,
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        notes: String
    }]
},
{
    timestamps: true
});

module.exports =
mongoose.model(
    "Task",
    taskSchema
);