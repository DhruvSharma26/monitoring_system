const rateLimit = require("express-rate-limit");

// General limiter for APIs (e.g. 100 requests per 15 minutes)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        message: "Too many requests from this IP, please try again after 15 minutes"
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for Auth/Login routes (e.g. 10 requests per 15 minutes)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: "Too many login attempts from this IP, please try again after 15 minutes"
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for OTP generation routes (e.g. 5 requests per 15 minutes)
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        message: "Too many OTP requests from this IP, please try again after 15 minutes"
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiLimiter,
    authLimiter,
    otpLimiter
};
