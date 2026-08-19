const nodemailer = require("nodemailer");
const logger = require("../../config/logger");

async function send(smtpSettings, { to, subject, text, html }) {
  const transporter = nodemailer.createTransport({
    host: smtpSettings.host,
    port: smtpSettings.port,
    secure: smtpSettings.secure,
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
  });

  const recipients = Array.isArray(to) ? to.join(", ") : to;

  const info = await transporter.sendMail({
    from: `"${smtpSettings.fromName || "WMS Linker"}" <${smtpSettings.fromEmail}>`,
    to: recipients,
    subject,
    text,
    html,
  });

  logger.debug({ messageId: info.messageId, to: recipients }, "Email sent");
  return info;
}

module.exports = { send };
