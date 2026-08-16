const mongoose = require("mongoose");

const dailyRatingSchema = new mongoose.Schema(
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
    date: {
        type: String, // YYYY-MM-DD
        required: true,
        index: true
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    sumOfParticularRatings: {
        type: Number,
        default: 0
    },
    dailyAverageRating: {
        type: Number,
        default: 5.0
    }
},
{
    timestamps: true
});

dailyRatingSchema.index({ device_uid: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyRating", dailyRatingSchema);
