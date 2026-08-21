const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/controllers/dashboardController.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `    if (alertItem.status === "EXPIRED" || alertItem.assignmentStatus === "EXPIRED") {
        alertItem.status = "EXPIRED";
        alertItem.assignmentStatus = "EXPIRED";
        alertItem.isExpired = true;
        alertItem.adminRemarks = "";
        alertItem.remarks = \`EXPIRED (\${alertItem.alertCategory}): Alert from previous day was not resolved\`;
    } else if (alertItem.status === "OPEN" || alertItem.assignmentStatus === "NOT_ASSIGNED") {
        alertItem.status = alertItem.alertType || alertItem.alertCategory || alertItem.status || "Critical";
        alertItem.adminRemarks = "";
        alertItem.remarks = alertItem.description || alertItem.alertType || 'Alert triggered';
    }`;

const replacement = `    if (alertItem.status === "EXPIRED" || alertItem.assignmentStatus === "EXPIRED") {
        alertItem.status = "EXPIRED";
        alertItem.assignmentStatus = "EXPIRED";
        alertItem.isExpired = true;
        alertItem.adminRemarks = alertItem.adminRemarks || "";
        alertItem.remarks = alertItem.adminRemarks || \`EXPIRED (\${alertItem.alertCategory}): Alert from previous day was not resolved\`;
    } else if (alertItem.status === "OPEN" || alertItem.assignmentStatus === "NOT_ASSIGNED") {
        alertItem.status = alertItem.alertType || alertItem.alertCategory || alertItem.status || "Critical";
        alertItem.adminRemarks = alertItem.adminRemarks || "";
        alertItem.remarks = alertItem.adminRemarks || alertItem.description || alertItem.alertType || 'Alert triggered';
    }`;

content = content.replace(/\r\n/g, '\n');

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESSFULLY_PRESERVED_ADMIN_REMARKS_DASHBOARD");
} else {
    console.log("TARGET_NOT_FOUND");
}
