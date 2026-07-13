const mongoose = require("mongoose");

const sensorDataSchema = new mongoose.Schema(
{
    device_uid: {
        type: String,
        required: true,
        trim: true
    },

    user_id: {
        type: String,
        trim: true
    },

    timestamp: {
        type: Date,
        default: Date.now
    },

    feedback: {
        type: Number,
        enum: [0, 1, 2, 3], // 0=Excellent, 1=Good, 2=Bad, 3=Very Bad (assuming similar scale)
        required: true
    },

    Counter: {
        type: Number,
        default: 0
    },

    OdorSensVal: {
        type: Number,
        default: 0
    }

},
{
    timestamps: true
}
);

// Optimized for queries like:
// SensorData.findOne({ device_uid }).sort({ timestamp: -1 })
sensorDataSchema.index({
    device_uid: 1,
    timestamp: -1
});

module.exports = mongoose.model(
    "SensorData",
    sensorDataSchema
);