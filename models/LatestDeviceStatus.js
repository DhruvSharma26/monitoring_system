const mongoose = require("mongoose");

const latestDeviceStatusSchema =
new mongoose.Schema(
{
    device_uid: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    user_id: String,

    feedback: Number,

    Counter: Number,

    OdorSensVal: Number,

    timestamp: Date
},
{
    timestamps: true
}
);

module.exports =
mongoose.model(
    "LatestDeviceStatus",
    latestDeviceStatusSchema
);