const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
{
    staff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    device: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device",
        required: true
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE"
    },
    assignedAt: {
        type: Date,
        default: Date.now
    },
    unassignedAt: Date
},
{
    timestamps: true
});

module.exports = mongoose.model("Assignment", assignmentSchema);
