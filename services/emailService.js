const axios = require("axios");

/**
 * Send email directly via Brevo v3 Transactional Email REST API.
 * Eliminates SMTP timeouts and port blocking on cloud platforms like Render.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plain text body fallback
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
const sendEmail = async ({ to, subject, html, text }) => {
    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || "astikasinha@gmail.com";
    const senderName = process.env.SENDER_NAME || "Sinexus Monitoring";

    if (!brevoApiKey) {
        console.error("❌ [BREVO API ERROR] BREVO_API_KEY is missing in environment variables.");
        throw new Error("Email service misconfigured: Missing BREVO_API_KEY.");
    }

    console.log(`📧 [BREVO API INITIATED] Sending email to ${to} | Subject: "${subject}"...`);

    const payload = {
        sender: {
            name: senderName,
            email: senderEmail
        },
        to: [
            { email: to }
        ],
        subject: subject,
        htmlContent: html || text,
        textContent: text || ""
    };

    try {
        const response = await axios.post("https://api.brevo.com/v3/smtp/email", payload, {
            headers: {
                "accept": "application/json",
                "api-key": brevoApiKey,
                "content-type": "application/json"
            },
            timeout: 10000 // 10-second timeout for quick API execution
        });

        const data = response.data;
        const messageId = data?.messageId || "OK";

        console.log(`✅ [BREVO API SUCCESS] Email delivered to ${to} | Message ID: ${messageId}`);
        return { success: true, messageId };
    } catch (error) {
        let errorMessage = error.message;
        let statusCode = error.response ? error.response.status : null;
        let responseData = error.response ? error.response.data : null;

        if (responseData && responseData.message) {
            errorMessage = responseData.message;
        }

        console.error(`❌ [BREVO API ERROR] Failed to send email to ${to} | Status: ${statusCode || 'N/A'} | Error: ${errorMessage}`);
        if (responseData) {
            console.error(`❌ [BREVO API ERROR DETAILS]`, JSON.stringify(responseData));
        }

        throw new Error(`Failed to send email via Brevo API: ${errorMessage}`);
    }
};

module.exports = { sendEmail };
