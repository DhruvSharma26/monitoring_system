/**
 * Single Source of Truth Classification Matrix
 */
const classifyTelemetry = (feedbackVal, counterVal, odorVal, settings) => {
    const counterThreshold = settings?.counterThreshold || 100;
    const odorThreshold = settings?.odorThreshold || 80;

    // Warning Thresholds are ALWAYS exactly 50% of Settings Thresholds
    const counterWarning = counterThreshold * 0.5;
    const odorWarning = odorThreshold * 0.5;

    const counter = Number(counterVal) || 0;
    const odor = Number(odorVal) || 0;
    const fb = Number(feedbackVal) || 1;

    // Comparison rules: <= warning is BELOW/WITHIN, > warning is ABOVE
    const isCounterAbove = counter > counterWarning;
    const isOdorAbove = odor > odorWarning;

    const bothBelowWithin = !isCounterAbove && !isOdorAbove;
    const oneAboveOneBelow = (isCounterAbove && !isOdorAbove) || (!isCounterAbove && isOdorAbove);
    const bothAbove = isCounterAbove && isOdorAbove;

    let rating = 5.0;
    let status = "CLEAN";
    let alertType = null;
    let alertSubtype = null;
    let description = null;

    if (fb === 1 || fb === 2) {
        if (bothBelowWithin) {
            rating = 5.0;
            status = "CLEAN";
        } else if (oneAboveOneBelow) {
            rating = 4.5;
            status = "CLEAN";
        } else if (bothAbove) {
            rating = 4.0;
            status = "NEEDS_ATTENTION";
            alertType = "NEEDS_ATTENTION";
            alertSubtype = "NA_1";
            description = "Positive feedback, but both monitored parameters are above their Warning Thresholds.";
        }
    } else if (fb === 3) {
        if (bothBelowWithin) {
            rating = 3.5;
            status = "NEEDS_ATTENTION";
            alertType = "NEEDS_ATTENTION";
            alertSubtype = "NA_2";
            description = "Moderate feedback, with both monitored parameters within their Warning Thresholds.";
        } else if (oneAboveOneBelow) {
            rating = 3.0;
            status = "NEEDS_ATTENTION";
            alertType = "NEEDS_ATTENTION";
            alertSubtype = "NA_3";
            description = "Moderate feedback, with one monitored parameter above its Warning Threshold.";
        } else if (bothAbove) {
            rating = 2.5;
            status = "CRITICAL";
            alertType = "CRITICAL";
            alertSubtype = "C_1";
            description = "Moderate feedback, with both monitored parameters above their Warning Thresholds.";
        }
    } else if (fb === 4) {
        if (bothBelowWithin) {
            rating = 2.0;
            status = "CRITICAL";
            alertType = "CRITICAL";
            alertSubtype = "C_2";
            description = "Poor feedback, although both monitored parameters are within their Warning Thresholds.";
        } else if (oneAboveOneBelow) {
            rating = 1.5;
            status = "CRITICAL";
            alertType = "CRITICAL";
            alertSubtype = "C_3";
            description = "Poor feedback, with one monitored parameter above its Warning Threshold.";
        } else if (bothAbove) {
            rating = 1.0;
            status = "CRITICAL";
            alertType = "CRITICAL";
            alertSubtype = "C_4";
            description = "Poor feedback, with both monitored parameters above their Warning Thresholds.";
        }
    }

    return {
        rating,
        status,
        alertType,
        alertSubtype,
        description,
        counterWarning,
        odorWarning,
        isCounterAbove,
        isOdorAbove
    };
};

module.exports = {
    classifyTelemetry
};
