const mongoose = require('mongoose');
require('dotenv').config();

async function checkDb() {
  await mongoose.connect(process.env.MONGO_URI);
  const LatestDeviceStatus = require('./models/LatestDeviceStatus');
  const Device = require('./models/Device');
  
  const dev = await Device.find({}, 'device_uid location floor').lean();
  console.log("All Devices:", dev);
  
  const status = await LatestDeviceStatus.find({}, 'device_uid feedback').lean();
  console.log("All LatestDeviceStatus:", status);
  
  process.exit(0);
}

checkDb();
