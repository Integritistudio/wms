const { lookup: dnsLookup } = require("dns");
const nodemailer = require("nodemailer");
const logger = require("../../config/logger");

function lookupWithTimeout(hostname, options, callback) {
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    const err = new Error(`SMTP DNS lookup timed out for ${hostname}`);
    err.code = "ETIMEDOUT";
    callback(err, "", 4);
  }, 4000);
  dnsLookup(hostname, options, (err, address, family) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    callback(err, address, family);
  });
}

async function send(smtpSettings, { to, subject, text, html }) {
  const transporter = nodemailer.createTransport({
    host: smtpSettings.host,
    port: smtpSettings.port,
    secure: smtpSettings.secure,
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
    lookup: lookupWithTimeout,
    connectionTimeout: 8000,
    greetingTimeout: 6000,
    socketTimeout: 12000,
  });
  transporter.on("error", (err) => {
    logger.warn({ err }, "SMTP transport error");
  });

  const recipients = Array.isArray(to) ? to.join(", ") : to;

  try {
    const info = await transporter.sendMail({
      from: `"${smtpSettings.fromName || "WMS Linker"}" <${smtpSettings.fromEmail}>`,
      to: recipients,
      subject,
      text,
      html,
    });

    logger.debug({ messageId: info.messageId, to: recipients }, "Email sent");
    return info;
  } finally {
    transporter.close();
  }
}

module.exports = { send };
