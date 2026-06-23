const express = require("express");

const router = express.Router();

const {
    registerAdmin,
    login
} = require("../controllers/authController");

router.post(
    "/register-admin",
    registerAdmin
);

router.post(
    "/login",
    login
);

module.exports = router;