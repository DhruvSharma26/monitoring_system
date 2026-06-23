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
        enum: [1, 2, 3, 4], // 1=Excellent, 2=Good, 3=Bad, 4=Very Bad
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