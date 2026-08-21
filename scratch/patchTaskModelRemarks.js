const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/models/Task.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `    adminRemarks: String,`;
const replacement = `    adminRemarks: String,
    reassignNotes: String,`;

content = content.replace(/\r\n/g, '\n');
content = content.replace(target, replacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log("SUCCESSFULLY_UPDATED_TASK_MODEL");
