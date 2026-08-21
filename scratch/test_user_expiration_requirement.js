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
        const alertService = require('../services/alertService');

        console.log('==================================================');
        console.log('TESTING PREVIOUS DAY ALERT & TASK LIFECYCLE RULE');
        console.log('==================================================');

        const devUid = 'DEV_11';
        const device = await Device.findOne({ device_uid: devUid });

        if (!device) {
            console.error('Device DEV_11 not found!');
            process.exit(1);
        }

        // Find a staff user to assign to DEV_11 for the test
        const staffUser = await User.findOne({ role: 'staff' });
        if (staffUser) {
            device.assignedStaff = staffUser._id;
            await device.save();
        }

        const assignedStaffId = device.assignedStaff;
        console.log('Device DEV_11 assigned staff ID:', assignedStaffId);

        // 1. Create a mock alert & task from YESTERDAY
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const oldAlert = await Alert.create({
            device_uid: devUid,
            deviceId: device.deviceId,
            device: device._id,
            alertCategory: 'Critical',
            alertType: 'Critical',
            description: 'Old Critical Alert from Yesterday',
            status: 'ASSIGNED',
            createdAt: yesterday,
            updatedAt: yesterday
        });

        const oldTask = await Task.create({
            taskName: 'Restroom Maintenance - ' + devUid,
            title: 'Critical Maintenance Task',
            alert: oldAlert._id,
            device: device._id,
            staff: assignedStaffId,
            status: 'ASSIGNED',
            priority: 'high',
            assignedAt: yesterday,
            createdAt: yesterday,
            updatedAt: yesterday,
            notes: 'Assigned yesterday'
        });

        console.log('1. Created Yesterday Alert (' + oldAlert._id + ') & Task (' + oldTask._id + ') | Status: ' + oldAlert.status + ' / ' + oldTask.status);

        // TEST CHECK 1: Before new alert arrives today, past alert and task MUST NOT be EXPIRED!
        const checkBeforeOldAlert = await Alert.findById(oldAlert._id);
        const checkBeforeOldTask = await Task.findById(oldTask._id);

        if (checkBeforeOldAlert.status !== 'EXPIRED' && checkBeforeOldTask.status !== 'EXPIRED') {
            console.log('  [PASS] Yesterday alert & task are NOT EXPIRED on present date when no new alert has arrived!');
        } else {
            console.error('  [FAIL] Yesterday alert or task was prematurely EXPIRED!');
            process.exit(1);
        }

        // 2. Trigger a NEW alert TODAY for the same device
        console.log('\n2. Processing NEW alert TODAY for device DEV_11...');
        const newResult = await alertService.processOrCreateDeviceAlert({
            device_uid: devUid,
            deviceId: device.deviceId,
            alertCategory: 'Critical',
            alertType: 'Critical',
            description: 'New Critical Alert Today',
            Counter: 250,
            OdorSensVal: 80,
            feedback: 3
        });

        console.log('   New Alert Created ID: ' + newResult.alert._id + ' | Overwritten: ' + newResult.isOverwritten + ' | Status: ' + newResult.alert.status);

        // TEST CHECK 2: Now that a new alert arrived today, yesterday alert & task MUST be marked EXPIRED!
        const refreshedOldAlert = await Alert.findById(oldAlert._id);
        const refreshedOldTask = await Task.findById(oldTask._id);
        const todayTask = await Task.findOne({ alert: newResult.alert._id });

        console.log('   Refreshed Old Alert (' + refreshedOldAlert._id + ') Status: ' + refreshedOldAlert.status + ' | AssignmentStatus: ' + refreshedOldAlert.assignmentStatus);
        console.log('   Refreshed Old Task (' + refreshedOldTask._id + ') Status: ' + refreshedOldTask.status);
        console.log('   Today New Task (' + (todayTask ? todayTask._id : 'N/A') + ') Status: ' + (todayTask ? todayTask.status : 'N/A') + ' | Staff: ' + (todayTask ? todayTask.staff : 'N/A'));

        if (refreshedOldAlert.status === 'EXPIRED' && refreshedOldTask.status === 'EXPIRED' && todayTask && todayTask.status === 'ASSIGNED') {
            console.log('\n  [PASS] Yesterday alert & task cleanly marked EXPIRED and a NEW alert card & task were created for today assigned to device staff!');
        } else {
            console.error('\n  [FAIL] Expiration workflow failed after new alert arrived!');
            process.exit(1);
        }

        // Clean up mock test alerts & tasks
        await Alert.deleteMany({ _id: { $in: [oldAlert._id, newResult.alert._id] } });
        await Task.deleteMany({ _id: { $in: [oldTask._id, todayTask ? todayTask._id : null].filter(Boolean) } });

        console.log('\nAll lifecycle verification checks PASSED successfully!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
