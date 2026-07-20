const mongoose = require('mongoose');
require('dotenv').config();

async function mockDev13() {
  await mongoose.connect(process.env.MONGO_URI);
  const LatestDeviceStatus = require('./models/LatestDeviceStatus');
  const Device = require('./models/Device');
  const User = require('./models/User');

  // get first user
  const user = await User.findOne({});
  if (!user) { console.log("No user found"); process.exit(0); }

  await Device.create({
    device_uid: "DEV_13",
    deviceId: "DEV_13_ID",
    adminId: user._id,
    location: "Mock Floor",
    floor: "1"
  });

  await LatestDeviceStatus.create({
    device_uid: "DEV_13",
    feedback: 4,
    Counter: 5,
    OdorSensVal: 10
  });

  console.log("Mock data inserted!");
  process.exit(0);
}

mockDev13();
