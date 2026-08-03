const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

async function testS3() {
    const s3Client = new S3Client({
        region: process.env.AWS_REGION || "ap-south-1",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
    });

    try {
        console.log("Attempting to upload a test file to S3 under task-photos/...");
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME || "sinexus-image-bucket",
            Key: "task-photos/test-read.txt",
            Body: "Hello S3 Public Read!",
            ContentType: "text/plain"
        });

        const response = await s3Client.send(command);
        console.log("✅ S3 upload successful!", response);
        process.exit(0);
    } catch (err) {
        console.error("❌ S3 upload failed:", err);
        process.exit(1);
    }
}

testS3();
