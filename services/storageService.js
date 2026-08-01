const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload directories exist for testing
const uploadsDir = path.join(__dirname, "..", "uploads", "task-photos");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Local Storage Configuration (Multer)
const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || ".jpg";
        cb(null, `photo-${uniqueSuffix}${ext}`);
    }
});

// File Filter (Images Only)
const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed!"), false);
    }
};

const upload = multer({
    storage: diskStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB per image
    }
});

/**
 * Generate full accessible URL for uploaded file.
 * Returns local server URL during testing, or S3 CDN URL in production.
 */
function getFileUrl(file, req) {
    if (!file) return "";

    if (process.env.STORAGE_PROVIDER === "s3" && file.location) {
        return file.location; // AWS S3 URL
    }

    // Local Storage URL
    const host = req ? req.get("host") : "localhost:5000";
    const protocol = req ? req.protocol : "http";
    return `${protocol}://${host}/uploads/task-photos/${file.filename}`;
}

module.exports = {
    upload,
    getFileUrl
};
