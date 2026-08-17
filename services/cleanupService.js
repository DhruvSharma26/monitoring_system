const Task = require("../models/Task");
const Alert = require("../models/Alert");

/**
 * Cleanup tasks and alerts older than 30 days based on their own final lifecycle dates.
 * AWS S3 images are automatically deleted after 30 days, so purging
 * database records after 30 days prevents broken/orphaned tasks and alerts.
 */
async function cleanupOldResolvedItems() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // 1. Find resolved tasks older than 30 days based on their current final status date
        const oldResolvedTasks = await Task.find({
            $or: [
                { status: "VERIFIED", verifiedAt: { $lt: thirtyDaysAgo, $ne: null } },
                { status: "COMPLETED", completedAt: { $lt: thirtyDaysAgo, $ne: null } },
                { status: "RESOLVED", resolvedAt: { $lt: thirtyDaysAgo, $ne: null } }
            ]
        }).select("_id");

        const taskIdsToDelete = oldResolvedTasks.map(t => t._id);

        // 2. Find resolved alerts older than 30 days based on alert's own resolvedAt timestamp
        const oldResolvedAlerts = await Alert.find({
            status: "RESOLVED",
            resolvedAt: { $lt: thirtyDaysAgo, $ne: null }
        }).select("_id");

        const alertIdsToDelete = oldResolvedAlerts.map(a => a._id);

        let tasksDeleted = 0;
        let alertsDeleted = 0;

        if (taskIdsToDelete.length > 0) {
            const taskRes = await Task.deleteMany({ _id: { $in: taskIdsToDelete } });
            tasksDeleted = taskRes.deletedCount || 0;
        }

        if (alertIdsToDelete.length > 0) {
            const alertRes = await Alert.deleteMany({ _id: { $in: alertIdsToDelete } });
            alertsDeleted = alertRes.deletedCount || 0;
        }

        if (tasksDeleted > 0 || alertsDeleted > 0) {
            console.log(`🧹 Cleanup Service: Successfully purged ${tasksDeleted} tasks and ${alertsDeleted} alerts resolved >= 30 days ago.`);
        }
    } catch (err) {
        console.error("❌ Cleanup Service Error:", err.message);
    }
}

function startCleanupJob() {
    // Run initial purge 10s after startup
    setTimeout(cleanupOldResolvedItems, 10000);
    // Repeat every 1 hour (3,600,000 ms)
    setInterval(cleanupOldResolvedItems, 60 * 60 * 1000);
    console.log("⏰ Cleanup Service: Active (Purges resolved tasks & alerts older than 30 days every 1 hour).");
}

module.exports = {
    cleanupOldResolvedItems,
    startCleanupJob
};

