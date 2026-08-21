const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/controllers/alertController.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `            alertItem.adminRemarks = task.adminRemarks || alertItem.adminRemarks || "";`;

const replacement = `            alertItem.adminRemarks = task.adminRemarks || alertItem.adminRemarks || task.notes || alertItem.notes || "";
            alertItem.reassignNotes = alertItem.reassignNotes || (task ? task.notes : null) || alertItem.adminRemarks || "";`;

content = content.replace(/\r\n/g, '\n');

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESSFULLY_UPDATED_ALERT_CONTROLLER_REMARKS");
} else {
    console.log("TARGET_NOT_FOUND");
}
