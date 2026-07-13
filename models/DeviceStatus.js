const mongoose = require("mongoose");

const deviceStatusSchema =
new mongoose.Schema(
{
    device_uid: {
        type: String,
        required: true,
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
    "DeviceStatus",
    deviceStatusSchema
);