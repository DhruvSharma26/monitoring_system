const mongoose = require("mongoose");
const getAlerts = require("../controllers/alertController").getAlerts;

console.log("==========================================");
console.log("🧪 TESTING getAlerts LOGIC FOR ADMIN CARDS");
console.log("==========================================");

const reqMock = {
    user: { id: "60d5ec123456789012345678", role: "admin" },
    query: {}
};

let resJson = null;
const resMock = {
    status: function(code) {
        return {
            json: function(data) {
                resJson = data;
                return data;
            }
        };
    }
};

console.log("Testing getAlerts with mocked request...");
// Running without DB connection should catch any sync/runtime syntax or mapping bugs
try {
    getAlerts(reqMock, resMock).then(() => {
        console.log("Result received:", resJson);
        console.log("✅ getAlerts executed successfully!");
    }).catch(err => {
        console.error("❌ Execution error:", err);
    });
} catch (err) {
    console.error("❌ Sync error:", err);
}
