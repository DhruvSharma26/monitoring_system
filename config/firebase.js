const admin = require("firebase-admin");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const fs = require("fs");
const path = require("path");

let isInitialized = false;

function initFirebase() {
    try {
        if (getApps().length > 0) {
            isInitialized = true;
            return;
        }

        let credential = null;

        // 1. Check for JSON string in environment variable
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
                credential = cert(serviceAccount);
            } catch (e) {
                console.log("⚠️ Could not parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
            }
        }

        // 2. Check for individual environment variables
        if (!credential && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
            credential = cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey
            });
        }

        // 3. Check for local firebase-service-account.json file
        if (!credential) {
            const localPath = path.join(__dirname, "firebase-service-account.json");
            const rootPath = path.join(__dirname, "..", "firebase-service-account.json");
            
            if (fs.existsSync(localPath)) {
                const serviceAccount = require(localPath);
                credential = cert(serviceAccount);
            } else if (fs.existsSync(rootPath)) {
                const serviceAccount = require(rootPath);
                credential = cert(serviceAccount);
            }
        }

        if (credential) {
            initializeApp({
                credential: credential
            });
            isInitialized = true;
            console.log("🔥 Firebase Admin SDK initialized successfully.");
        } else {
            console.log("ℹ️ Firebase Admin SDK is pending configuration (Awaiting environment variables or firebase-service-account.json).");
        }
    } catch (error) {
        console.log("⚠️ Firebase Initialization Warning:", error.message);
        isInitialized = false;
    }
}

// Call init on module load
initFirebase();

/**
 * Send FCM push notification to a single token or list of tokens.
 * @param {Object} params
 * @param {String|Array<String>} params.tokens - FCM Device token(s)
 * @param {String} params.title - Notification title
 * @param {String} params.body - Notification body
 * @param {Object} [params.data] - Additional payload data
 */
async function sendPushNotification({ tokens, title, body, data = {} }) {
    if (!isInitialized || getApps().length === 0) {
        // Try initializing once more in case env vars were set at runtime
        initFirebase();
    }

    if (!isInitialized || getApps().length === 0) {
        console.log(`[FCM Pending] Push notification skipped for "${title}" - Firebase credentials not provided yet.`);
        return { success: false, message: "Firebase credentials not provided" };
    }

    const tokenList = Array.isArray(tokens) ? tokens.filter(Boolean) : (tokens ? [tokens] : []);

    if (tokenList.length === 0) {
        return { success: false, message: "No valid FCM tokens provided" };
    }

    // Convert all data object values to string (FCM requirement for data payload)
    const stringData = {};
    for (const key in data) {
        if (data[key] !== undefined && data[key] !== null) {
            stringData[key] = String(data[key]);
        }
    }

    try {
        const messagePayload = {
            notification: {
                title: title,
                body: body
            },
            data: stringData,
            tokens: tokenList
        };

        const response = await getMessaging().sendEachForMulticast(messagePayload);
        console.log(`🚀 FCM Push sent! Success: ${response.successCount}, Failures: ${response.failureCount}`);
        return { success: true, response };
    } catch (error) {
        console.log("❌ FCM Send Error:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    admin,
    sendPushNotification,
    isFirebaseReady: () => isInitialized
};
