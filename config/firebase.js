const admin = require("firebase-admin");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const fs = require("fs");
const path = require("path");

let isInitialized = false;

/**
 * Initialize Firebase Admin SDK using environment variables or local service account file.
 * Handles both JSON string formats and escaped newline characters in private keys.
 */
function initFirebase() {
    try {
        if (getApps().length > 0) {
            isInitialized = true;
            return;
        }

        let credential = null;
        let projectId = null;

        // 1. Check for JSON string in environment variable (FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_JSON)
        const rawJsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (rawJsonEnv) {
            try {
                const serviceAccount = typeof rawJsonEnv === "object" 
                    ? rawJsonEnv 
                    : JSON.parse(rawJsonEnv);

                if (serviceAccount.private_key) {
                    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
                }

                credential = cert(serviceAccount);
                projectId = serviceAccount.project_id;
                console.log(`🔥 [FIREBASE] Parsed service account JSON successfully (Project ID: ${projectId || 'N/A'}).`);
            } catch (jsonErr) {
                console.error("❌ [FIREBASE ERROR] Could not parse FIREBASE_SERVICE_ACCOUNT JSON string:", jsonErr.message);
            }
        }

        // 2. Check for individual environment variables
        if (!credential && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            try {
                const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
                projectId = process.env.FIREBASE_PROJECT_ID;
                credential = cert({
                    projectId: projectId,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                });
                console.log(`🔥 [FIREBASE] Loaded credentials from individual environment variables (Project ID: ${projectId}).`);
            } catch (envErr) {
                console.error("❌ [FIREBASE ERROR] Failed to load credentials from individual env vars:", envErr.message);
            }
        }

        // 3. Check for local firebase-service-account.json file
        if (!credential) {
            const localPath = path.join(__dirname, "firebase-service-account.json");
            const rootPath = path.join(__dirname, "..", "firebase-service-account.json");
            
            let filePath = null;
            if (fs.existsSync(localPath)) {
                filePath = localPath;
            } else if (fs.existsSync(rootPath)) {
                filePath = rootPath;
            }

            if (filePath) {
                try {
                    const serviceAccount = require(filePath);
                    if (serviceAccount.private_key) {
                        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
                    }
                    credential = cert(serviceAccount);
                    projectId = serviceAccount.project_id;
                    console.log(`🔥 [FIREBASE] Loaded service account from file: ${filePath}`);
                } catch (fileErr) {
                    console.error(`❌ [FIREBASE ERROR] Failed to load service account file (${filePath}):`, fileErr.message);
                }
            }
        }

        if (credential) {
            initializeApp({
                credential: credential
            });
            isInitialized = true;
            console.log(`🔥 Firebase Admin SDK initialized successfully (Project: ${projectId || 'Active'}).`);
        } else {
            console.warn("⚠️ Firebase Admin SDK: Missing FIREBASE_SERVICE_ACCOUNT environment variable or service account file. Mobile push notifications will be disabled.");
        }
    } catch (error) {
        console.error("❌ Firebase Initialization Error:", error.message);
        isInitialized = false;
    }
}

// Initialize on module load
initFirebase();

/**
 * Send FCM push notification to single or multiple device tokens.
 * Automatically cleans up invalid/expired tokens from MongoDB.
 * 
 * @param {Object} params
 * @param {String|Array<String>} params.tokens - FCM Device token(s)
 * @param {String} params.title - Notification title
 * @param {String} params.body - Notification body
 * @param {Object} [params.data] - Additional payload data
 */
async function sendPushNotification({ tokens, title, body, data = {} }) {
    if (!isInitialized || getApps().length === 0) {
        initFirebase();
    }

    if (!isInitialized || getApps().length === 0) {
        console.log(`[FCM Skipped] Push notification skipped for "${title}" - Firebase credentials not provided.`);
        return { success: false, message: "Firebase credentials not provided" };
    }

    const rawTokenList = Array.isArray(tokens) 
        ? tokens.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
        : (tokens && typeof tokens === 'string' && tokens.trim().length > 0 ? [tokens.trim()] : []);

    const tokenList = Array.from(new Set(rawTokenList));

    if (tokenList.length === 0) {
        return { success: false, message: "No valid FCM tokens provided" };
    }

    // Convert all payload values to string (required by FCM data payload)
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
            tokens: tokenList,

            // ─── Android High Priority Configuration ──────────────────────────────
            android: {
                priority: "high",
                notification: {
                    channelId: "sinexus_high_importance_channel",
                    sound: "default",
                    defaultVibrateTimings: true,
                    notificationPriority: "PRIORITY_HIGH",
                    visibility: "PUBLIC"
                },
                data: {
                    ...stringData
                }
            },

            // ─── Apple iOS APNs Configuration ─────────────────────────────────────
            apns: {
                payload: {
                    aps: {
                        alert: { title: title, body: body },
                        sound: "default",
                        badge: 1,
                        "content-available": 1
                    }
                },
                headers: {
                    "apns-priority": "10"
                }
            }
        };

        const response = await getMessaging().sendEachForMulticast(messagePayload);
        console.log(`🚀 [FCM PUSH] Delivered push for "${title}" | Success: ${response.successCount}, Failure: ${response.failureCount}`);

        // Handle invalid/expired tokens cleanup
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errCode = resp.error?.code || "";
                    const errMsg = resp.error?.message || "";
                    console.warn(`⚠️ [FCM TOKEN ERROR] Token [${tokenList[idx].substring(0, 10)}...]: Code: ${errCode} | Error: ${errMsg}`);
                    if (
                        errCode === "messaging/registration-token-not-registered" || 
                        errCode === "messaging/invalid-registration-token" ||
                        errMsg.includes("NotRegistered") ||
                        errMsg.includes("InvalidRegistration")
                    ) {
                        invalidTokens.push(tokenList[idx]);
                    }
                }
            });

            if (invalidTokens.length > 0) {
                try {
                    const User = require("../models/User");
                    await User.updateMany(
                        { fcmTokens: { $in: invalidTokens } },
                        { $pullAll: { fcmTokens: invalidTokens } }
                    );
                    await User.updateMany(
                        { fcmToken: { $in: invalidTokens } },
                        { $unset: { fcmToken: "" } }
                    );
                    console.log(`🧹 [FCM CLEANUP] Purged ${invalidTokens.length} expired/invalid FCM token(s) from MongoDB.`);
                } catch (dbErr) {
                    console.error("❌ [FCM CLEANUP ERROR] Failed to purge invalid tokens from database:", dbErr.message);
                }
            }
        }

        return { success: true, response };
    } catch (error) {
        console.error("❌ [FCM SEND EXCEPTION] Failed to send push notification:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    admin,
    sendPushNotification,
    isFirebaseReady: () => isInitialized
};
