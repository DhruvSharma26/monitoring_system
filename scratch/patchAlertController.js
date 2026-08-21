const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/controllers/alertController.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `            alertItem.category = alertItem.alertCategory;
            alertItem.type = alertItem.alertType;`;

const replacement = `            alertItem.category = alertItem.alertCategory;
            alertItem.type = alertItem.alertType;
            alertItem.expiredAlertType = alertItem.alertCategory;`;

content = content.replace(/\r\n/g, '\n');

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESSFULLY_UPDATED_ALERT_CONTROLLER");
} else {
    console.log("TARGET_NOT_FOUND");
}
