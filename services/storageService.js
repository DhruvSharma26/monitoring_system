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

let storageEngine = diskStorage;

if (process.env.STORAGE_PROVIDER === "s3") {
    try {
        const { S3Client } = require("@aws-sdk/client-s3");
        const multerS3 = require("multer-s3");

        const s3Client = new S3Client({
            region: process.env.AWS_REGION || "ap-south-1",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });

        storageEngine = multerS3({
            s3: s3Client,
            bucket: process.env.AWS_BUCKET_NAME || "sinexus-image-bucket",
            contentType: multerS3.AUTO_CONTENT_TYPE,
            metadata: (req, file, cb) => {
                cb(null, { fieldName: file.fieldname });
            },
            key: (req, file, cb) => {
                const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
                const ext = path.extname(file.originalname) || ".jpg";
                cb(null, `task-photos/photo-${uniqueSuffix}${ext}`);
            }
        });
        console.log("🌲 Storage Service: AWS S3 storage engine initialized.");
    } catch (err) {
        console.error("❌ Storage Service S3 Initialization Error:", err.message);
        console.log("⚠️ Storage Service: Falling back to local disk storage.");
        storageEngine = diskStorage;
    }
}

const upload = multer({
    storage: storageEngine,
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
