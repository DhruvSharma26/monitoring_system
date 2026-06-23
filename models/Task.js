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
            "SUBMITTED",
            "VERIFIED"
        ],
        default: "ASSIGNED"
    },

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