const { body, validationResult } = require("express-validator");

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation Error",
            errors: errors.array()
        });
    }
    next();
};

const registerAdminValidator = [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("companyName").notEmpty().withMessage("Company name is required"),
    body("mobile").notEmpty().withMessage("Mobile number is required"),
    body("role").optional().isIn(["admin"]).withMessage("Invalid role"),
    validate
];

const loginValidator = [
    body("userId").notEmpty().withMessage("User ID is required"),
    body("password").notEmpty().withMessage("Password is required"),
    validate
];

const emailOtpValidator = [
    body("email").isEmail().withMessage("Valid email is required"),
    validate
];

const verifyOtpValidator = [
    body("email").isEmail().withMessage("Valid email is required"),
    body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    validate
];

const resetPasswordValidator = [
    body("email").isEmail().withMessage("Valid email is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    validate
];

module.exports = {
    registerAdminValidator,
    loginValidator,
    emailOtpValidator,
    verifyOtpValidator,
    resetPasswordValidator
};
