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
    connectionTimeout: 8000,
    greetingTimeout: 6000,
    socketTimeout: 12000,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
}

/**
 * @param {{ to: string|string[], subject: string, text?: string, html?: string, companyId?: string, idempotencyKey?: string }} opts
 */
async function sendMail({ to, subject, text, html }) {
  if (!to) {
    logger.warn({ subject }, "Email skipped (no recipient)");
    return { sent: false, reason: "no_recipient" };
  }

  const transport = getTransport();
  if (!transport) {
    logger.warn({ to, subject }, "Email skipped (SMTP not configured)");
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    await transport.sendMail({
      from: env.smtpFrom,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      text,
      html,
    });
  } finally {
    transport.close();
  }

  logger.info({ to, subject, via: "local-smtp" }, "Email sent");
  return { sent: true, via: "local-smtp" };
}

module.exports = {
  sendMail,
};
