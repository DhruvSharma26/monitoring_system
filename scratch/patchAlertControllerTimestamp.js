const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/controllers/alertController.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `            const latestTime = alertItem.updatedAt || alertItem.createdAt;
            alertItem.timestamp = latestTime;
            alertItem.createdAt = latestTime;`;

const replacement = `            const originalCreationTime = alertItem.createdAt || (alertItem._id && typeof alertItem._id.getTimestamp === 'function' ? alertItem._id.getTimestamp() : new Date());
            const latestTime = alertItem.updatedAt || alertItem.createdAt;
            alertItem.firstTriggeredAt = originalCreationTime;
            alertItem.triggeredAt = originalCreationTime;
            alertItem.createdAt = originalCreationTime;
            alertItem.updatedAt = alertItem.updatedAt || latestTime;
            alertItem.timestamp = latestTime;`;

content = content.replace(/\r\n/g, '\n');

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESSFULLY_UPDATED_ALERT_CONTROLLER_TIMESTAMP");
} else {
    console.log("TARGET_NOT_FOUND");
}
