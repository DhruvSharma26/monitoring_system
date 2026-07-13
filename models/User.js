const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
{
    userId: {
        type: String,
        unique: true
    },

    role: {
        type: String,
        enum: ["admin", "staff"],
        required: true
    },

    companyName: String,

    country: String,

    contactPerson: String,

    designation: String,

    name: String,

    email: {
        type: String,
        required: true,
        unique: true
    },

    mobile: {
        type: String,
        required: true
    },

    alternateNumber: String,

    empId: String,

    assignedDevice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device"
    },

    password: {
        type: String,
        required: true
    },

    isVerified: {
        type: Boolean,
        default: false
    },

    refreshToken: {
        type: String
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("User", userSchema);