const fs = require('fs');
const filePath = 'C:/Users/admin/Downloads/monitoring_system/models/Alert.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `    status: {
        type: String,
        enum: [
            "OPEN",
            "ASSIGNED",
            "IN_PROGRESS",
            "REJECTED",
            "VERIFIED",
            "RESOLVED",
            "EXPIRED"
        ],
        default: "OPEN"
    },

    resolvedAt: Date`;

const replacement = `    status: {
        type: String,
        enum: [
            "OPEN",
            "ASSIGNED",
            "IN_PROGRESS",
            "REJECTED",
            "VERIFIED",
            "RESOLVED",
            "EXPIRED"
        ],
        default: "OPEN"
    },

    resolvedAt: Date,

    adminRemarks: {
        type: String,
        default: ""
    },
    reassignNotes: {
        type: String,
        default: ""
    },
    remarks: {
        type: String,
        default: ""
    },
    notes: {
        type: String,
        default: ""
    }`;

content = content.replace(/\r\n/g, '\n');
content = content.replace(target, replacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log("SUCCESSFULLY_UPDATED_ALERT_MODEL");
