/**
 * Single Source of Truth Classification Engine
 * Evaluates Counter, Odor, and Feedback against configured Admin Settings.
 */
const classifyTelemetry = (feedbackVal, counterVal, odorVal, settings) => {
    const counterThreshold = Number(settings?.counterThreshold) || 100;
    const odorThreshold = Number(settings?.odorThreshold) || 200;

    // 75% Need Attention Thresholds
    const counterNeedAttentionThreshold = counterThreshold * 0.75;
    const odorNeedAttentionThreshold = odorThreshold * 0.75;

    const counter = Number(counterVal) || 0;
    const odor = Number(odorVal) || 0;
    const feedback = (feedbackVal !== undefined && feedbackVal !== null) ? Number(feedbackVal) : 4;

    // 1. Evaluate Counter Rule
    let counterSeverity = "NONE";
    if (counter > counterThreshold) {
        counterSeverity = "CRITICAL";
    } else if (counter > counterNeedAttentionThreshold) {
        counterSeverity = "NEED_ATTENTION";
    }

    // 2. Evaluate Odor Rule
    let odorSeverity = "NONE";
    if (odor > odorThreshold) {
        odorSeverity = "CRITICAL";
    } else if (odor > odorNeedAttentionThreshold) {
        odorSeverity = "NEED_ATTENTION";
    }

    // 3. Evaluate Feedback Rule
    let feedbackSeverity = "NONE";
    if (feedback === 1 || feedback === 2) {
        feedbackSeverity = "CRITICAL";
    } else if (feedback === 3) {
        feedbackSeverity = "NEED_ATTENTION";
    } else if (feedback === 4) {
        feedbackSeverity = "NONE";
    }

    // 4. Determine Overall Category & Priority (Critical > Need Attention > None)
    let overallSeverity = "NONE";
    if (counterSeverity === "CRITICAL" || odorSeverity === "CRITICAL" || feedbackSeverity === "CRITICAL") {
        overallSeverity = "CRITICAL";
    } else if (counterSeverity === "NEED_ATTENTION" || odorSeverity === "NEED_ATTENTION" || feedbackSeverity === "NEED_ATTENTION") {
        overallSeverity = "NEED_ATTENTION";
    }

    const alertCategory = overallSeverity === "CRITICAL" ? "Critical" : (overallSeverity === "NEED_ATTENTION" ? "Need Attention" : null);
    const alertType = overallSeverity === "CRITICAL" ? "CRITICAL" : (overallSeverity === "NEED_ATTENTION" ? "NEEDS_ATTENTION" : null);
    const toiletStatus = overallSeverity === "CRITICAL" ? "CRITICAL" : (overallSeverity === "NEED_ATTENTION" ? "NEEDS_ATTENTION" : "CLEAN");

    // 5. Generate Detailed Descriptions for ALL Triggered Conditions
    const triggeredDescriptions = [];
    const triggeredValues = [];

    // Counter Description
    if (counterSeverity === "CRITICAL") {
        const diff = counter - counterThreshold;
        triggeredDescriptions.push(`Counter value is ${counter}, exceeding the configured threshold of ${counterThreshold} by ${diff}.`);
        triggeredValues.push("Counter");
    } else if (counterSeverity === "NEED_ATTENTION") {
        triggeredDescriptions.push(`Counter value is ${counter}, exceeding the Need Attention threshold of ${counterNeedAttentionThreshold}.`);
        triggeredValues.push("Counter");
    }

    // Odor Description
    if (odorSeverity === "CRITICAL") {
        const diff = odor - odorThreshold;
        triggeredDescriptions.push(`Odor value is ${odor} ppm, exceeding the configured threshold of ${odorThreshold} ppm by ${diff} ppm.`);
        triggeredValues.push("Odor");
    } else if (odorSeverity === "NEED_ATTENTION") {
        triggeredDescriptions.push(`Odor value is ${odor} ppm, exceeding the Need Attention threshold of ${odorNeedAttentionThreshold} ppm.`);
        triggeredValues.push("Odor");
    }

    // Feedback Description
    if (feedbackSeverity === "CRITICAL") {
        triggeredDescriptions.push(`Customer feedback rating is ${feedback}, indicating a Critical condition.`);
        triggeredValues.push("Feedback");
    } else if (feedbackSeverity === "NEED_ATTENTION") {
        triggeredDescriptions.push(`Customer feedback rating is 3, indicating Need Attention.`);
        triggeredValues.push("Feedback");
    }

    let description = "Device operating within normal thresholds.";
    if (triggeredDescriptions.length > 0) {
        const prefix = alertCategory ? `${alertCategory}: ` : "";
        description = prefix + triggeredDescriptions.join(" ");
    }

    return {
        status: toiletStatus,
        toiletStatus: toiletStatus,
        alertCategory,
        alertType,
        description,

        counterSeverity,
        odorSeverity,
        feedbackSeverity,

        counterValue: counter,
        odorValue: odor,
        feedbackValue: feedback,

        counterThreshold,
        odorThreshold,
        counterNeedAttentionThreshold,
        odorNeedAttentionThreshold,

        triggeredValues
    };
};

module.exports = {
    classifyTelemetry
};
