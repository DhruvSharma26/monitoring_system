const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/services/alertService.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `            existingUnassignedAlert.updateCount = (existingUnassignedAlert.updateCount || 1) + 1;
            existingUnassignedAlert.status = initialAlertStatus;
            existingUnassignedAlert.createdAt = new Date();
            await existingUnassignedAlert.save();`;

const replacement = `            existingUnassignedAlert.updateCount = (existingUnassignedAlert.updateCount || 1) + 1;
            existingUnassignedAlert.status = initialAlertStatus;
            existingUnassignedAlert.updatedAt = new Date();
            await existingUnassignedAlert.save();`;

content = content.replace(/\r\n/g, '\n');

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESSFULLY_UPDATED_ALERT_SERVICE_TIMESTAMP");
} else {
    console.log("TARGET_NOT_FOUND");
}
