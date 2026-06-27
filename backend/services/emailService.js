const nodemailer = require("nodemailer");

function isEmailEnabled() {
  return String(process.env.EMAIL_ENABLED || "false").toLowerCase() === "true";
}

function getEmailConfig() {
  return {
    enabled: isEmailEnabled(),
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true").toLowerCase() === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    fromName: process.env.EMAIL_FROM_NAME || "Lohitha Dharma Projects CRM"
  };
}

function getEmailStatus() {
  const config = getEmailConfig();
  return {
    enabled: config.enabled,
    configured: Boolean(config.user && config.pass),
    host: config.host,
    port: config.port,
    secure: config.secure,
    from: config.user ? `${config.fromName} <${config.user}>` : "Not configured"
  };
}

function createTransporter() {
  const config = getEmailConfig();
  if (!config.enabled) {
    throw new Error("Email API is disabled. Set EMAIL_ENABLED=true in backend/.env.");
  }
  if (!config.user || !config.pass) {
    throw new Error("SMTP_USER and SMTP_PASS are required for Email API.");
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

async function verifyEmailConnection() {
  const transporter = createTransporter();
  await transporter.verify();
  return true;
}

function buildHtmlMessage(text) {
  const safeText = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>${safeText}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="font-size: 13px; color: #6b7280;">
        This is an automated message from Lohitha Dharma Projects CRM.
      </p>
    </div>
  `;
}

async function sendCustomerEmail({ to, subject, text }) {
  const config = getEmailConfig();

  if (!config.enabled) {
    return { sent: false, status: "Email Disabled", error: "EMAIL_ENABLED is false" };
  }

  if (!to) {
    return { sent: false, status: "No Customer Email", error: "Customer email is missing" };
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `${config.fromName} <${config.user}>`,
    to,
    subject: subject || "CRM Notification",
    text: String(text || ""),
    html: buildHtmlMessage(text)
  });

  return { sent: true, status: "Email Sent", messageId: info.messageId };
}

module.exports = {
  getEmailStatus,
  verifyEmailConnection,
  sendCustomerEmail
};
