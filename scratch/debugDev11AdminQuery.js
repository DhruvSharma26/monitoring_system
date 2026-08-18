const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch (e) {}

const mongoose = require("mongoose");

async function run() {
    try {
        const uri = "mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
        await mongoose.connect(uri);

        const Device = require("../models/Device");
        const Alert = require("../models/Alert");
        const User = require("../models/User");
        const { getAlerts } = require("../controllers/alertController");

        const adminIdVal = "6a4cc11050c84e14ea0e8cef"; // astikasinha937@gmail.com
        const adminUser = await User.findById(adminIdVal).lean();
        console.log(`Admin User: ${adminUser.email} (_id: ${adminUser._id})`);

        // 1. Fetch devices for this admin
        const isObjectId = mongoose.Types.ObjectId.isValid(adminIdVal);
        const myDevices = await Device.find({
            $or: [
                { adminId: adminIdVal },
                ...(isObjectId ? [{ adminId: new mongoose.Types.ObjectId(adminIdVal) }] : [])
            ]
        })
        .populate("assignedStaff", "name empId userId email")
        .select("_id device_uid deviceId location floor locationName assignedStaff adminId")
        .lean();

        console.log(`\nDevices registered under Admin ${adminUser.email}: Total ${myDevices.length}`);
        const dev11InAdmin = myDevices.find(d => (d.device_uid || "").toLowerCase() === "dev_11" || (d.deviceId || "").toLowerCase() === "dev_11" || (d.deviceId || "").toLowerCase() === "opulentmall-f1-01");
        console.log("DEV_11 Device Object found in Admin's devices:", dev11InAdmin);

        // 2. Trace query generation in getAlerts
        const alertConditions = [];
        const adminDeviceUids = [];
        myDevices.forEach(d => {
            if (d.device_uid) adminDeviceUids.push(d.device_uid);
            if (d.deviceId) adminDeviceUids.push(d.deviceId);
        });
        const uniqueAdminUids = Array.from(new Set(adminDeviceUids.filter(Boolean)));
        console.log(`\nUnique Admin Device UIDs/IDs (${uniqueAdminUids.length}):`, uniqueAdminUids);

        if (uniqueAdminUids.length > 0) {
            const regexUids = uniqueAdminUids.map(u => new RegExp(`^${u.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
            alertConditions.push({ device_uid: { $in: regexUids } });
            alertConditions.push({ deviceId: { $in: regexUids } });
        }
        if (myDevices.length > 0) {
            alertConditions.push({ device: { $in: myDevices.map(d => d._id) } });
        }

        const query = { $or: alertConditions };
        console.log("\nGenerated Mongoose Query for Admin Alerts:", JSON.stringify(query, null, 2));

        // 3. Find raw Alert documents matching this query
        const rawAlerts = await Alert.find(query).sort({ createdAt: -1 }).lean();
        console.log(`\nRaw Alerts matching Admin's devices: ${rawAlerts.length}`);

        const dev11RawAlerts = rawAlerts.filter(a => 
            (a.device_uid && a.device_uid.toLowerCase() === "dev_11") ||
            (a.deviceId && (a.deviceId.toLowerCase() === "dev_11" || a.deviceId.toLowerCase() === "opulentmall-f1-01")) ||
            (a.device && a.device.toString() === dev11InAdmin._id.toString())
        );

        console.log(`Raw Alerts for DEV_11 matching query: ${dev11RawAlerts.length}`);
        dev11RawAlerts.forEach((a, i) => {
            console.log(`   [Alert ${i + 1}] ID: ${a._id} | device_uid: "${a.device_uid}" | deviceId: "${a.deviceId}" | device Ref: "${a.device}" | status: "${a.status}" | category: "${a.alertCategory}" | createdAt: ${a.createdAt}`);
        });

        // 4. Now execute getAlerts controller API and inspect returned alerts
        const reqMock = { user: { id: adminIdVal, role: "admin" }, query: {} };
        let apiData = null;
        const resMock = { status: function() { return this; }, json: function(data) { apiData = data; return data; } };
        await getAlerts(reqMock, resMock);

        console.log(`\nAPI Returned Alerts Count: ${apiData.alerts.length}`);
        const dev11ApiAlerts = apiData.alerts.filter(a =>
            (a.device_uid && a.device_uid.toLowerCase() === "dev_11") ||
            (a.deviceId && (a.deviceId.toLowerCase() === "dev_11" || a.deviceId.toLowerCase() === "opulentmall-f1-01"))
        );

        console.log(`API Returned Alerts for DEV_11: ${dev11ApiAlerts.length}`);
        dev11ApiAlerts.forEach((a, i) => {
            console.log(`   [API Card ${i + 1}] ID: ${a._id} | device_uid: "${a.device_uid}" | status: "${a.status}" | assignmentStatus: "${a.assignmentStatus}" | isAssigned: ${a.isAssigned} | createdAt: ${a.createdAt}`);
        });

        // 5. Test tab query parameters (e.g., status=open, status=not_assigned, status=all)
        for (const tabParam of ["all", "open", "not_assigned", "unassigned", "assigned"]) {
            const reqTab = { user: { id: adminIdVal, role: "admin" }, query: { status: tabParam } };
            let tabData = null;
            const resTab = { status: function() { return this; }, json: function(data) { tabData = data; return data; } };
            await getAlerts(reqTab, resTab);

            const tabDev11 = tabData.alerts.filter(a =>
                (a.device_uid && a.device_uid.toLowerCase() === "dev_11") ||
                (a.deviceId && (a.deviceId.toLowerCase() === "dev_11" || a.deviceId.toLowerCase() === "opulentmall-f1-01"))
            );
            console.log(`\nQuery ?status=${tabParam} -> Total Alerts: ${tabData.alerts.length} | DEV_11 Alerts: ${tabDev11.length}`);
            tabDev11.forEach((a, idx) => {
                console.log(`   └─ DEV_11 Card: ID: ${a._id} | status: "${a.status}" | assignmentStatus: "${a.assignmentStatus}" | Category: "${a.alertCategory}"`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
