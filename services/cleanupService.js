const Task = require("../models/Task");
const Alert = require("../models/Alert");

/**
 * Cleanup tasks and alerts that were resolved 15 days ago or longer.
 * AWS S3 images are automatically deleted after 15 days, so purging
 * database records after 15 days prevents broken/orphaned tasks.
 */
async function cleanupOldResolvedItems() {
    try {
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

        // 1. Find resolved tasks older than 15 days
        const oldResolvedTasks = await Task.find({
            status: { $in: ["VERIFIED", "COMPLETED", "RESOLVED"] },
            $or: [
                { resolvedAt: { $lt: fifteenDaysAgo } },
                { verifiedAt: { $lt: fifteenDaysAgo } },
                { completedAt: { $lt: fifteenDaysAgo } },
                { submittedAt: { $lt: fifteenDaysAgo } },
                { updatedAt: { $lt: fifteenDaysAgo } }
            ]
        }).select("_id alert");

        const taskIdsToDelete = oldResolvedTasks.map(t => t._id);
        const alertIdsFromTasks = oldResolvedTasks.map(t => t.alert).filter(Boolean);

        // 2. Find resolved alerts older than 15 days
        const oldResolvedAlerts = await Alert.find({
            status: "RESOLVED",
            $or: [
                { resolvedAt: { $lt: fifteenDaysAgo } },
                { verifiedAt: { $lt: fifteenDaysAgo } },
                { completedAt: { $lt: fifteenDaysAgo } },
                { updatedAt: { $lt: fifteenDaysAgo } }
            ]
        }).select("_id");

        const alertIdsToDelete = Array.from(new Set([
            ...alertIdsFromTasks.map(id => id.toString()),
            ...oldResolvedAlerts.map(a => a._id.toString())
        ]));

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
            console.log(`🧹 Cleanup Service: Successfully purged ${tasksDeleted} tasks and ${alertsDeleted} alerts resolved >= 15 days ago.`);
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
    console.log("⏰ Cleanup Service: Active (Purges resolved tasks & alerts older than 15 days every 1 hour).");
}

module.exports = {
    cleanupOldResolvedItems,
    startCleanupJob
};
