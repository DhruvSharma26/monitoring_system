const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
{
    device_uid: {
        type: String,
        required: true
    },

    deviceId: {
        type: String,
        unique: true
    },

    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    deviceCategory: String,

    deviceModelNumber: String,

    location: String,

    floor: String,

    installationDate: Date,

    tabLocation: String,

    latitude: Number,

    longitude: Number,

    assignedStaff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    status: {
        type: String,
        enum: ["clean", "warning", "critical"],
        default: "clean"
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("Device", deviceSchema);