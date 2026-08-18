const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const { classifyTelemetry } = require("../services/alertClassifier");
        const settings = { counterThreshold: 50, odorThreshold: 8 };

        console.log("==================================================");
        console.log("🔍 TESTING TELEMETRY CLASSIFICATION BEHAVIOR:");
        console.log("==================================================");

        // Case 1: High counter & high odor (Abnormal telemetry)
        const abnormalTelemetry = classifyTelemetry(2, 210, 65, settings);
        console.log("Case 1 (Abnormal Telemetry - Counter=210, Odor=65, Feedback=2):");
        console.log(`   Toilet Status: "${abnormalTelemetry.toiletStatus}"`);

        // Case 2: Clean telemetry received via MQTT after cleaning (Counter=0, Odor=2, Feedback=4 [Good])
        const cleanTelemetry = classifyTelemetry(4, 0, 2, settings);
        console.log("\nCase 2 (Clean Telemetry via MQTT - Counter=0, Odor=2, Feedback=4):");
        console.log(`   Toilet Status: "${cleanTelemetry.toiletStatus}"`);

        if (cleanTelemetry.toiletStatus === "Clean" && abnormalTelemetry.toiletStatus === "Critical") {
            console.log("\n  [PASS] Clean MQTT telemetry successfully sets device status to 'Clean'!");
        } else {
            console.error("\n  [FAIL] Classification failed!");
            process.exit(1);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
