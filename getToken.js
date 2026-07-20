const mongoose = require('mongoose');
require('dotenv').config();
const jwt = require('jsonwebtoken');

async function getToken() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');

  const user = await User.findOne({});
  if (!user) { console.log("No user found"); process.exit(0); }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  console.log("TOKEN=" + token);
  process.exit(0);
}

getToken();
