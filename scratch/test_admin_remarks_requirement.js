const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const mongoose = require('mongoose');

async function run() {
    try {
        const uri = 'mongodb+srv://admin:admin123@cluster0.dtap0xf.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
        await mongoose.connect(uri);

        const Device = require('../models/Device');
        const Alert = require('../models/Alert');
        const Task = require('../models/Task');
        const User = require('../models/User');
        const { forceVerifyTask, reassignTask } = require('../controllers/taskController');
        const { getAlerts } = require('../controllers/alertController');

        console.log('==================================================');
        console.log('🧪 TESTING FORCE VERIFY & REASSIGN ADMIN REMARKS');
        console.log('==================================================');

        const devUid = 'DEV_11';
        const device = await Device.findOne({ device_uid: devUid });
        const adminUser = await User.findOne({ role: 'admin' });
        const staffUser = await User.findOne({ role: 'staff' });

        // 1. Create a test alert & task
        const testAlert = await Alert.create({
            device_uid: devUid,
            deviceId: device.deviceId,
            device: device._id,
            alertCategory: 'Critical',
            alertType: 'Critical',
            description: 'Test Alert for Remarks',
            status: 'ASSIGNED'
        });

        const testTask = await Task.create({
            taskName: 'Test Maintenance Task',
            title: 'Critical Maintenance Task',
            alert: testAlert._id,
            device: device._id,
            staff: staffUser._id,
            status: 'ASSIGNED',
            notes: 'Initial task notes'
        });

        // TEST 1: Reassign Task with custom reason
        console.log('\n--- TEST 1: Reassigning task with custom notes ---');
        const reassignReq = {
            body: {
                taskId: testTask._id.toString(),
                staffId: staffUser._id.toString(),
                notes: 'Reassigning to re-clean washbasin and floor properly'
            },
            user: { id: adminUser._id.toString(), role: 'admin' }
        };
        const reassignRes = { status: function() { return this; }, json: function(d) { return d; } };

        await reassignTask(reassignReq, reassignRes);

        const updatedTaskReassigned = await Task.findById(testTask._id);
        const updatedAlertReassigned = await Alert.findById(testAlert._id);

        console.log('Reassigned Task adminRemarks:', updatedTaskReassigned.adminRemarks);
        console.log('Reassigned Alert adminRemarks:', updatedAlertReassigned.adminRemarks);

        if (updatedTaskReassigned.adminRemarks.includes('re-clean washbasin') && updatedAlertReassigned.adminRemarks.includes('re-clean washbasin')) {
            console.log('  [PASS] Reassign custom notes saved on both Task and Alert!');
        } else {
            console.error('  [FAIL] Reassign custom notes failed to save!');
            process.exit(1);
        }

        // TEST 2: Force Verify Task with custom reason
        console.log('\n--- TEST 2: Force Verifying task with custom reason ---');
        const forceVerifyReq = {
            body: {
                taskId: testTask._id.toString(),
                remarks: 'Force verified due to physical inspection by Senior Admin'
            },
            params: { taskId: testTask._id.toString() },
            user: { id: adminUser._id.toString(), role: 'admin' }
        };
        const forceVerifyRes = { status: function() { return this; }, json: function(d) { return d; } };

        await forceVerifyTask(forceVerifyReq, forceVerifyRes);

        const updatedTaskFV = await Task.findById(testTask._id);
        const updatedAlertFV = await Alert.findById(testAlert._id);

        console.log('Force Verified Task adminRemarks:', updatedTaskFV.adminRemarks);
        console.log('Force Verified Alert adminRemarks:', updatedAlertFV.adminRemarks);

        if (updatedTaskFV.adminRemarks.includes('Senior Admin') && updatedAlertFV.adminRemarks.includes('Senior Admin')) {
            console.log('  [PASS] Force Verify custom remarks saved on both Task and Alert!');
        } else {
            console.error('  [FAIL] Force Verify custom remarks failed to save!');
            process.exit(1);
        }

        // TEST 3: Verify API Controller returns adminRemarks in getAlerts
        console.log('\n--- TEST 3: Fetching via getAlerts API Controller ---');
        let jsonRes = null;
        const apiReq = { user: { id: adminUser._id.toString(), role: 'admin' }, query: {} };
        const apiRes = { status: function() { return this; }, json: function(d) { jsonRes = d; return d; } };

        await getAlerts(apiReq, apiRes);

        const card = jsonRes.alerts.find(a => String(a._id) === String(testAlert._id));
        console.log('API returned alert adminRemarks:', card.adminRemarks);
        console.log('API returned alert remarks:', card.remarks);

        if (card && card.adminRemarks.includes('Senior Admin')) {
            console.log('  [PASS] API response correctly surfaced adminRemarks on alert card!');
        } else {
            console.error('  [FAIL] API response missing adminRemarks!');
            process.exit(1);
        }

        // Cleanup
        await Alert.deleteOne({ _id: testAlert._id });
        await Task.deleteOne({ _id: testTask._id });

        console.log('\nAll Admin Remarks verification checks PASSED successfully!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
