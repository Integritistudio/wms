const Notification = require("./model");
const SmtpSettings = require("./smtpModel");
const emailSender = require("./emailSender");
const logger = require("../../config/logger");

async function create({ companyId, userId, type, title, message, meta }) {
  const notification = await Notification.create({
    companyId,
    userId: userId || null,
    type,
    title,
    message: message || "",
    meta: meta || {},
  });

  sendEmailIfConfigured(companyId, type, title, message).catch(() => {});

  return notification;
}

async function sendEmailIfConfigured(companyId, type, title, message) {
  try {
    const settings = await SmtpSettings.findOne({ companyId, enabled: true });
    if (!settings) return;
    if (!settings.notifyOn.includes(type)) return;
    if (!settings.recipients.length) return;

    await emailSender.send(settings, {
      to: settings.recipients,
      subject: `[WMS Linker] ${title}`,
      text: message || title,
      html: `<div style="font-family:sans-serif;padding:20px;"><h2 style="color:#1a1a2e;">${title}</h2><p style="color:#444;">${message || ""}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0;"><p style="color:#999;font-size:12px;">WMS Linker Notification — ${type}</p></div>`,
    });

    await Notification.updateOne(
      { companyId, type, title, createdAt: { $gte: new Date(Date.now() - 5000) } },
      { $set: { emailSent: true } }
    );
  } catch (error) {
    logger.warn({ err: error, companyId: companyId?.toString() }, "Email notification failed");
  }
}

async function listByCompany(companyId, { unreadOnly = false, page, limit } = {}) {
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const filter = { companyId };
  if (unreadOnly) filter.read = false;

  const skip = (pageNum - 1) * limitNum;
  const [total, items] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
  ]);

  return {
    items,
    total,
    page: pageNum,
    limit: limitNum,
  };
}

async function countUnread(companyId) {
  return Notification.countDocuments({ companyId, read: false });
}

async function markRead(id) {
  return Notification.findByIdAndUpdate(id, { read: true }, { new: true });
}

async function markAllRead(companyId) {
  return Notification.updateMany({ companyId, read: false }, { $set: { read: true } });
}

async function getSmtpSettings(companyId) {
  return SmtpSettings.findOne({ companyId }).lean();
}

async function saveSmtpSettings(companyId, data) {
  return SmtpSettings.findOneAndUpdate(
    { companyId },
    { $set: { ...data, companyId } },
    { upsert: true, new: true }
  );
}

async function testSmtp(companyId) {
  const settings = await SmtpSettings.findOne({ companyId });
  if (!settings) throw new Error("No SMTP settings configured");

  await emailSender.send(settings, {
    to: settings.recipients.length ? settings.recipients : [settings.fromEmail],
    subject: "[WMS Linker] SMTP Test",
    text: "This is a test email from WMS Linker. Your SMTP settings are working correctly.",
    html: '<div style="font-family:sans-serif;padding:20px;"><h2>SMTP Test Successful</h2><p>Your email notifications are configured correctly.</p></div>',
  });

  return { success: true };
}

module.exports = {
  create,
  listByCompany,
  countUnread,
  markRead,
  markAllRead,
  getSmtpSettings,
  saveSmtpSettings,
  testSmtp,
};
