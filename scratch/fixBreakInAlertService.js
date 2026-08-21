const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/services/alertService.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `            if (altDateStr === todayDateStr && !isStarted) {
                // Same calendar day & unstarted alert -> Overwrite this alert card with new telemetry
                existingUnassignedAlert = alt;
                break;
            }`;

const replacement = `            if (altDateStr === todayDateStr && !isStarted) {
                // Same calendar day & unstarted alert -> Overwrite this alert card with new telemetry
                if (!existingUnassignedAlert) {
                    existingUnassignedAlert = alt;
                }
            }`;

content = content.replace(/\r\n/g, '\n');

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESSFULLY_REMOVED_BREAK_FROM_ALERT_SERVICE");
} else {
    console.log("TARGET_NOT_FOUND");
}
