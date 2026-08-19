const nodemailer = require("nodemailer");
const env = require("../config/env");
const logger = require("../config/logger");

function getTransport() {
  if (!env.smtpConfigured) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
}

async function sendMail({ to, subject, text, html }) {
  const transport = getTransport();
  if (!transport || !to) {
    logger.warn({ to, subject }, "Email skipped (SMTP not configured)");
    return { sent: false, reason: "smtp_not_configured" };
  }

  await transport.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text,
    html,
  });

  logger.info({ to, subject }, "Email sent");
  return { sent: true };
}

module.exports = {
  sendMail,
};
