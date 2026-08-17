const mongoose = require("mongoose");

const particularRatingSchema = new mongoose.Schema(
{
    device: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device"
    },
    device_uid: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    date: {
        type: String, // YYYY-MM-DD
        index: true
    },
    counterValue: {
        type: Number,
        default: 0
    },
    counterRating: {
        type: Number,
        required: true
    },
    odorValue: {
        type: Number,
        default: 0
    },
    odorRating: {
        type: Number,
        required: true
    },
    customerFeedback: {
        type: Number,
        required: true
    },
    feedbackRating: {
        type: Number,
        required: true
    },
    particularRating: {
        type: Number,
        required: true
    }
},
{
    timestamps: true
});

particularRatingSchema.index({ device_uid: 1, timestamp: -1 });
particularRatingSchema.index({ device_uid: 1, date: 1 });

module.exports = mongoose.model("ParticularRating", particularRatingSchema);
