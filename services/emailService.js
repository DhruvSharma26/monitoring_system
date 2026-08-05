const nodemailer = require("nodemailer");

/**
 * Send email using Brevo SMTP Relay or Brevo REST API
 */
const sendEmail = async ({ to, subject, html, text }) => {
    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || "astikasinha@gmail.com";
    const senderName = process.env.SENDER_NAME || "Sinexus Monitoring";

    // 1. Primary: Brevo SMTP Relay via Nodemailer (Port 587)
    if (process.env.SMTP_HOST || process.env.EMAIL_PASS) {
        try {
            console.log(`📧 [BREVO SMTP] Sending email to ${to}...`);
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_PORT == 465,
                auth: {
                    user: process.env.EMAIL_USER || "b26feb001@smtp-brevo.com",
                    pass: process.env.EMAIL_PASS || brevoApiKey
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            const info = await transporter.sendMail({
                from: `"${senderName}" <${senderEmail}>`,
                to,
                subject,
                text,
                html: html || text
            });

            console.log(`✅ [BREVO SMTP SUCCESS] Email sent to ${to}. MessageId: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (smtpErr) {
            console.error(`⚠️ [BREVO SMTP ERROR] ${smtpErr.message}. Attempting REST API...`);
        }
    }

    // 2. Fallback: Brevo v3 Transactional Email REST API
    if (brevoApiKey) {
        try {
            const response = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: {
                    "accept": "application/json",
                    "api-key": brevoApiKey,
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    sender: { name: senderName, email: senderEmail },
                    to: [{ email: to }],
                    subject: subject,
                    htmlContent: html || text,
                    textContent: text
                })
            });

            const data = await response.json();
            if (response.ok) {
                console.log(`✅ [BREVO API SUCCESS] Email sent to ${to}. MessageId: ${data.messageId || 'OK'}`);
                return { success: true, messageId: data.messageId };
            } else {
                console.error(`⚠️ [BREVO API ERROR]`, data);
            }
        } catch (err) {
            console.error(`❌ [BREVO API EXCEPTION]`, err.message);
        }
    }

    throw new Error("Failed to send email via Brevo.");
};

module.exports = { sendEmail };
