const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function exploreAtlas() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
        console.log("Connecting to Atlas cluster...");
        const conn = await mongoose.createConnection(uri).asPromise();
        console.log("✅ Connected to Atlas cluster!");

        const adminDb = conn.db.admin();
        const dbsResult = await adminDb.listDatabases();
        console.log("\n📁 Databases on this Atlas Cluster:");
        
        for (const dbInfo of dbsResult.databases) {
            console.log(`\nDatabase: "${dbInfo.name}" (sizeOnDisk: ${dbInfo.sizeOnDisk} bytes)`);
            const dbConn = conn.useDb(dbInfo.name);
            const collections = await dbConn.db.listCollections().toArray();
            collections.forEach(col => {
                console.log(`   └─ Collection: "${col.name}"`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error("❌ Error exploring Atlas:", err);
        process.exit(1);
    }
}

exploreAtlas();
