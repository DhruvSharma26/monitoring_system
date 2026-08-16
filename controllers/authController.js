const User = require("../models/User");
const Otp = require("../models/Otp");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Helper function to generate unique, normalized Admin ID based on Admin Name + Company Name
const generateUniqueAdminId = async (adminNameInput, companyNameInput) => {
    const rawName = (adminNameInput || "ADMIN").trim();
    const rawCompany = (companyNameInput || "COMPANY").trim();

    const cleanName = rawName
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .trim()
        .replace(/\s+/g, "-");

    const cleanCompany = rawCompany
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .trim()
        .replace(/\s+/g, "-");

    const baseId = `${cleanName}-${cleanCompany}`.replace(/-+/g, "-");

    let adminId = baseId;
    let existing = await User.findOne({ userId: adminId });
    let counter = 1;

    while (existing) {
        const suffix = String(counter).padStart(3, "0");
        adminId = `${baseId}-${suffix}`;
        existing = await User.findOne({ userId: adminId });
        counter++;
    }

    return adminId;
};

const registerAdmin = async (req, res, next) => {
    try {
        const {
            userId: providedUserId,
            adminName,
            name,
            companyName,
            country,
            contactPerson,
            designation,
            email,
            mobile,
            alternateNumber,
            password
        } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const verifiedOtp = await Otp.findOne({
            email: normalizedEmail,
            verified: true
        });

        if (!verifiedOtp) {
            return res.status(400).json({
                success: false,
                message: "Please verify OTP first"
            });
        }

        if (verifiedOtp.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Verified OTP has expired. Please verify again."
            });
        }

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        const resolvedAdminName = contactPerson || name || adminName || "Admin";
        const resolvedCompany = companyName || "Company";

        // Auto-generate Unique Admin ID
        let generatedAdminId = await generateUniqueAdminId(resolvedAdminName, resolvedCompany);

        const hashedPassword = await bcrypt.hash(password, 10);

        let admin;
        let retryCount = 0;
        while (!admin && retryCount < 5) {
            try {
                admin = await User.create({
                    userId: generatedAdminId,
                    role: "admin",
                    companyName: resolvedCompany,
                    country,
                    contactPerson: resolvedAdminName,
                    name: resolvedAdminName,
                    designation: designation || "Admin",
                    email: normalizedEmail,
                    mobile: mobile || "",
                    alternateNumber,
                    password: hashedPassword,
                    isVerified: true
                });
            } catch (createErr) {
                if (createErr.code === 11000 && createErr.keyPattern && createErr.keyPattern.userId) {
                    retryCount++;
                    const suffix = String(retryCount).padStart(3, "0");
                    generatedAdminId = `${generatedAdminId}-${suffix}`;
                } else {
                    throw createErr;
                }
            }
        }

        await Otp.deleteMany({ email: normalizedEmail });

        res.status(201).json({
            success: true,
            message: "Admin Registered Successfully",
            adminId: admin.userId,
            userId: admin.userId,
            admin: {
                adminId: admin.userId,
                userId: admin.userId,
                name: admin.name || admin.contactPerson,
                contactPerson: admin.contactPerson,
                companyName: admin.companyName,
                email: admin.email,
                mobile: admin.mobile
            }
        });

    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {

    try {

        const {
            email,
            userId,
            identifier,
            password
        } = req.body;
        
        // Determine the search criteria based on what is provided
        let query = {};
        if (identifier) {
            query = { $or: [{ email: identifier }, { userId: identifier }] };
        } else if (email) {
            query = { email };
        } else if (userId) {
            query = { userId };
        } else {
            return res.status(400).json({
                success: false,
                message: "Please provide email, userId, or identifier"
            });
        }

        const user =
            await User.findOne(query).populate("assignedDevice");

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        const isMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!isMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid Password"
            });

        }

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "15m"
            }
        );

        const refreshToken = jwt.sign(
            { id: user._id },
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        const { fcmToken } = req.body;
        if (fcmToken) {
            await User.updateMany(
                { _id: { $ne: user._id }, $or: [{ fcmToken: fcmToken }, { fcmTokens: fcmToken }] },
                { $unset: { fcmToken: "" }, $pull: { fcmTokens: fcmToken } }
            );
            user.fcmToken = fcmToken;
            if (!user.fcmTokens) user.fcmTokens = [];
            if (!user.fcmTokens.includes(fcmToken)) {
                user.fcmTokens.push(fcmToken);
            }
        }

        user.refreshToken = refreshToken;
        await user.save();

        res.status(200).json({
            success: true,
            token,
            refreshToken,
            role: user.role,
            userId: user.userId,
            email: user.email,
            id: user._id,
            name: user.name,
            empId: user.empId,
            companyName: user.companyName,
            contactPerson: user.contactPerson,
            designation: user.designation,
            mobile: user.mobile,
            assignedDevice: user.assignedDevice,
            allowGalleryUpload: user.allowGalleryUpload ?? false
        });

    } catch (error) {
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ success: false, message: "No refresh token provided" });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({ success: false, message: "Invalid refresh token" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        const newRefreshToken = jwt.sign(
            { id: user._id },
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        user.refreshToken = newRefreshToken;
        await user.save();

        res.status(200).json({
            success: true,
            token,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
        }
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (user) {
            user.refreshToken = null;
            await user.save();
        }
        res.status(200).json({ success: true, message: "Logged out" });
    } catch (error) {
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id)
            .select("-password -refreshToken")
            .populate("assignedDevice");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        next(error);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const {
            companyName,
            contactPerson,
            designation,
            mobile,
            alternateNumber,
            country
        } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (companyName !== undefined) user.companyName = companyName;
        if (contactPerson !== undefined) user.contactPerson = contactPerson;
        if (designation !== undefined) user.designation = designation;
        if (mobile !== undefined) user.mobile = mobile;
        if (alternateNumber !== undefined) user.alternateNumber = alternateNumber;
        if (country !== undefined) user.country = country;

        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerAdmin,
    login,
    refresh,
    logout,
    getMe,
    updateProfile
};