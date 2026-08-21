const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/services/alertService.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `                if (linkedTask && linkedTask.status !== "VERIFIED" && linkedTask.status !== "COMPLETED") {
                    await Task.updateOne(
                        { _id: linkedTask._id },
                        { $set: { status: "EXPIRED" } }
                    );
                }
                console.log(\`⏰ Previous day unresolved alert \${alt._id} for device [\${targetUid}] marked EXPIRED.\`);`;

const replacement = `                if (linkedTask && linkedTask.status !== "VERIFIED" && linkedTask.status !== "COMPLETED") {
                    await Task.updateOne(
                        { _id: linkedTask._id },
                        { $set: { status: "EXPIRED" } }
                    );
                }

                if (global.io) {
                    global.io.emit("alert_updated", {
                        alertId: alt._id,
                        status: "EXPIRED",
                        assignmentStatus: "EXPIRED"
                    });
                    if (linkedTask) {
                        global.io.emit("task_status_updated", {
                            taskId: linkedTask._id,
                            alertId: alt._id,
                            status: "EXPIRED",
                            staffId: linkedTask.staff
                        });
                    }
                }

                console.log(\`⏰ Previous day unresolved alert \${alt._id} for device [\${targetUid}] marked EXPIRED.\`);`;

// Normalize line endings to \n for robust matching
content = content.replace(/\r\n/g, '\n');

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESSFULLY_UPDATED_ALERT_SERVICE");
} else {
    console.log("TARGET_NOT_FOUND");
}
