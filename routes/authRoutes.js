const express = require("express");

const router = express.Router();

const {
    registerAdmin,
    login,
    refresh,
    logout
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");
const { registerAdminValidator, loginValidator } = require("../middleware/validators");

router.post(
    "/register-admin",
    authLimiter,
    registerAdminValidator,
    registerAdmin
);

router.post(
    "/login",
    authLimiter,
    loginValidator,
    login
);

router.post(
    "/refresh",
    refresh
);

router.post(
    "/logout",
    authMiddleware,
    logout
);

module.exports = router;