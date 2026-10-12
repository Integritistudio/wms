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

/**
 * @param {{ to: string|string[], subject: string, text?: string, html?: string, companyId?: string, idempotencyKey?: string }} opts
 */
async function sendMail({ to, subject, text, html, companyId, idempotencyKey }) {
  if (!to) {
    logger.warn({ subject }, "Email skipped (no recipient)");
    return { sent: false, reason: "no_recipient" };
  }

  const emailMs = require("../modules/emailMs/client");
  if (emailMs.enabled()) {
    const tenantKey = companyId ? String(companyId) : "platform";
    try {
      await emailMs.send(tenantKey, {
        to: Array.isArray(to) ? to : [to],
        subject,
        text: text || "",
        html: html || undefined,
        idempotencyKey: idempotencyKey || undefined,
      });
      logger.info({ to, subject, via: "email-ms", tenantKey }, "Email queued");
      return { sent: true, via: "email-ms" };
    } catch (err) {
      logger.warn(
        { err, to, subject },
        "Email-ms send failed; falling back to local SMTP if configured",
      );
    }
  }

  const transport = getTransport();
  if (!transport) {
    logger.warn({ to, subject }, "Email skipped (SMTP not configured)");
    return { sent: false, reason: "smtp_not_configured" };
  }

  await transport.sendMail({
    from: env.smtpFrom,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    text,
    html,
  });

  logger.info({ to, subject, via: "local-smtp" }, "Email sent");
  return { sent: true, via: "local-smtp" };
}

module.exports = {
  sendMail,
};
