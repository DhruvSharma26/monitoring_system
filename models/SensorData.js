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

    date: {
        type: String, // YYYY-MM-DD
        index: true
    },

    feedback: {
        type: Number,
        enum: [0, 1, 2, 3, 4], // 0=Clean, 1=Clean, 2=Warning, 4=Critical
        required: true
    },

    Counter: {
        type: Number,
        default: 0
    },

    CounterValue: {
        type: Number,
        default: 0
    },

    OdorSensVal: {
        type: Number,
        default: 0
    },

    OdorLevel: {
        type: Number,
        default: 0
    }

},
{
    timestamps: true
}
);

// Optimized for telemetry lookups, datewise graphs, and reports
sensorDataSchema.index({
    device_uid: 1,
    timestamp: -1
});

sensorDataSchema.index({
    device_uid: 1,
    date: 1,
    timestamp: -1
});

module.exports = mongoose.model(
    "SensorData",
    sensorDataSchema
);