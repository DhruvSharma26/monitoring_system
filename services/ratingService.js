const mongoose = require("mongoose");
const ParticularRating = require("../models/ParticularRating");
const DailyRating = require("../models/DailyRating");
const SensorData = require("../models/SensorData");

// Counter Rating Conversion (Lower is better)
const getCounterRating = (counterVal) => {
    const c = Number(counterVal) || 0;
    if (c <= 10) return 5;
    if (c <= 30) return 4;
    if (c <= 50) return 3;
    if (c <= 75) return 2;
    return 1;
};

// Odor Rating Conversion (Lower is better, ppm)
const getOdorRating = (odorVal) => {
    const o = Number(odorVal) || 0;
    if (o <= 50) return 5;
    if (o <= 150) return 4;
    if (o <= 250) return 3;
    if (o <= 350) return 2;
    return 1;
};

// Customer Feedback Rating Conversion
const getFeedbackRating = (feedbackVal) => {
    const fb = Number(feedbackVal) || 1;
    if (fb === 4) return 4;
    if (fb === 3) return 3;
    if (fb === 2) return 2;
    if (fb === 1) return 1;
    return 4; // default
};

// Calculate Particular Rating for a single feedback event
const calculateParticularRating = (counterVal, odorVal, feedbackVal) => {
    const cRating = getCounterRating(counterVal);
    const oRating = getOdorRating(odorVal);
    const fRating = getFeedbackRating(feedbackVal);
    return (cRating + oRating + fRating) / 3.0;
};

// Record individual ParticularRating and update DailyRating aggregate
const recordParticularRating = async ({ device_uid, device, timestamp, counter, odor, feedback }) => {
    try {
        if (!device_uid) return null;

        const cRating = getCounterRating(counter);
        const oRating = getOdorRating(odor);
        const fRating = getFeedbackRating(feedback);
        const particularRating = (cRating + oRating + fRating) / 3.0;

        const recordTime = timestamp ? new Date(timestamp) : new Date();
        const dateStr = recordTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        const ratingRecord = await ParticularRating.create({
            device: device ? device._id : null,
            device_uid: device_uid,
            timestamp: recordTime,
            date: dateStr,
            counterValue: Number(counter) || 0,
            counterRating: cRating,
            odorValue: Number(odor) || 0,
            odorRating: oRating,
            customerFeedback: Number(feedback) || 1,
            feedbackRating: fRating,
            particularRating: particularRating
        });

        // Update DailyRating aggregate atomically
        await DailyRating.findOneAndUpdate(
            { device_uid: device_uid, date: dateStr },
            {
                $inc: { totalRatings: 1, sumOfParticularRatings: particularRating },
                $setOnInsert: { device: device ? device._id : null }
            },
            { upsert: true, new: true }
        );

        // Recompute exact daily average
        const updatedDaily = await DailyRating.findOne({ device_uid: device_uid, date: dateStr });
        if (updatedDaily && updatedDaily.totalRatings > 0) {
            updatedDaily.dailyAverageRating = updatedDaily.sumOfParticularRatings / updatedDaily.totalRatings;
            await updatedDaily.save();
        }

        return ratingRecord;
    } catch (error) {
        console.error("Error in recordParticularRating:", error);
        return null;
    }
};

// Compute rolling Last 24-Hour metrics (Average Rating, Total Ratings, Total Usage)
const get24HourMetrics = async (devUids) => {
    try {
        const uids = Array.isArray(devUids) ? devUids.filter(Boolean) : [devUids].filter(Boolean);

        if (!uids || uids.length === 0) {
            return {
                averageRating: null,
                totalRatings: 0,
                totalUsage: 0
            };
        }

        const regexUids = uids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));

        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [ratings24h, logs24h] = await Promise.all([
            ParticularRating.find({
                $or: [{ device_uid: { $in: regexUids } }],
                timestamp: { $gte: twentyFourHoursAgo }
            }).lean(),
            SensorData.find({
                $or: [{ device_uid: { $in: regexUids } }],
                timestamp: { $gte: twentyFourHoursAgo }
            }).sort({ timestamp: 1 }).lean()
        ]);

        const totalRatings = ratings24h.length;
        let averageRating = null;
        if (totalRatings > 0) {
            const sum = ratings24h.reduce((acc, r) => acc + (Number(r.particularRating) || 0), 0);
            averageRating = parseFloat((sum / totalRatings).toFixed(2));
        }

        let totalUsage = 0;
        if (logs24h.length > 0) {
            const counters = logs24h.map(l => Number(l.Counter ?? l.counter ?? l.CounterValue ?? 0) || 0);
            const maxCounter = Math.max(...counters);
            const minCounter = Math.min(...counters);
            totalUsage = maxCounter > minCounter ? (maxCounter - minCounter) : maxCounter;
            if (totalUsage === 0 && logs24h.length > 0) {
                totalUsage = logs24h.length;
            }
        }

        return {
            averageRating,
            totalRatings,
            totalUsage
        };
    } catch (error) {
        console.error("Error in get24HourMetrics:", error);
        return {
            averageRating: null,
            totalRatings: 0,
            totalUsage: 0
        };
    }
};

// Particular rating breakdown details for reports & logs
const calculateParticularRatingDetails = (counterVal, odorVal, feedbackVal) => {
    const cVal = Number(counterVal) || 0;
    const oVal = Number(odorVal) || 0;
    const fVal = Number(feedbackVal) || 1;

    const cRating = getCounterRating(cVal);
    const oRating = getOdorRating(oVal);
    const fRating = getFeedbackRating(fVal);
    const particularRating = parseFloat(((cRating + oRating + fRating) / 3.0).toFixed(2));

    return {
        counterValue: cVal,
        counterRating: cRating,
        odorValue: oVal,
        odorRating: oRating,
        feedbackValue: fVal,
        feedbackRating: fRating,
        particularRating
    };
};

module.exports = {
    getCounterRating,
    getOdorRating,
    getFeedbackRating,
    calculateParticularRating,
    calculateParticularRatingDetails,
    recordParticularRating,
    get24HourMetrics
};
