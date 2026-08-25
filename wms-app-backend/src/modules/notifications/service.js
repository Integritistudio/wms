const Notification = require("./model");
const Company = require("../companies/model");
const members = require("../companies/members");
const SmtpSettings = require("./smtpModel");
const emailSender = require("./emailSender");
const logger = require("../../config/logger");

const TYPE_ALIASES = {
  order_received: "order_received",
  order_error: "order_error",
  sftp_failed: "sftp_failed",
  dlq_entry: "dlq_entry",
};

const ALLOWED_TYPES = new Set([
  "order_received",
  "order_fulfilled",
  "order_error",
  "sftp_failed",
  "945_received",
  "dlq_entry",
  "system",
]);

function normalizeType(type) {
  const mapped = TYPE_ALIASES[type] || type;
  return ALLOWED_TYPES.has(mapped) ? mapped : "system";
}

function toPublic(doc) {
  const row = doc?.toObject ? doc.toObject() : doc;
  if (!row) return null;
  return {
    _id: String(row._id),
    id: String(row._id),
    companyId: String(row.companyId),
    type: row.type,
    title: row.title,
    message: row.message || "",
    meta: row.meta || {},
    read: Boolean(row.read),
    emailSent: Boolean(row.emailSent),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function create(payload = {}) {
  const companyId = payload.companyId || payload.companyId;
  if (!companyId) return null;

  const type = normalizeType(payload.type);
  const title = payload.title || payload.title || "Notification";
  const message = payload.message || payload.message || "";
  const meta = payload.meta || payload.meta || {};

  // If no specific userId provided, attach the company root user so root sees the notification by default
  let userId = payload.userId || null;
  if (!userId) {
    try {
      const company = await Company.findById(companyId);
      if (company) {
        const rootMember = await members.ensureRootMember(company);
        if (rootMember) userId = rootMember._id;
      }
    } catch (err) {
      // ignore lookup errors — notification will still be created at company level
    }
  }

  const notification = await Notification.create({
    companyId,
    userId: userId || null,
    type,
    title,
    message,
    meta,
  });

  sendEmailIfConfigured(companyId, type, title, message).catch(() => {});
  return notification;
}

async function sendEmailIfConfigured(companyId, type, title, message) {
  try {
    const settings = await SmtpSettings.findOne({ companyId, enabled: true });
    if (!settings) return;

    const notifyOn = settings.notifyOn || settings.notifyOn || [];
    if (
      Array.isArray(notifyOn) &&
      notifyOn.length &&
      !notifyOn.includes(type) &&
      !notifyOn.includes(type)
    ) {
      const aliases = Object.entries(TYPE_ALIASES)
        .filter(([, canonical]) => canonical === type)
        .map(([alias]) => alias);
      if (!aliases.some((alias) => notifyOn.includes(alias))) return;
    }

    const recipients = settings.recipients || settings.recipients || [];
    if (!recipients.length) return;

    await emailSender.send(settings, {
      to: recipients,
      subject: `[WMS Linker] ${title}`,
      text: message || title,
      html: `<div style="font-family:sans-serif;padding:20px;"><h2 style="color:#1a1a2e;">${title}</h2><p style="color:#444;">${message || ""}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0;"><p style="color:#999;font-size:12px;">WMS Linker Notification — ${type}</p></div>`,
    });

    await Notification.updateOne(
      {
        companyId,
        type,
        title,
        createdAt: { $gte: new Date(Date.now() - 5000) },
      },
      { $set: { emailSent: true } },
    );
  } catch (error) {
    logger.warn(
      { err: error, companyId: String(companyId) },
      "Email notification failed",
    );
  }
}

async function listByCompany(
  companyId,
  { unreadOnly = false, page, limit } = {},
) {
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const filter = { companyId };
  if (unreadOnly) filter.read = false;

  const skip = (pageNum - 1) * limitNum;
  const [total, items] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  return {
    items: items.map(toPublic),
    total,
    page: pageNum,
    limit: limitNum,
  };
}

async function countUnread(companyId) {
  return Notification.countDocuments({ companyId, read: false });
}

async function markRead(id) {
  return Notification.findByIdAndUpdate(
    id,
    { read: true },
    { returnDocument: "after" },
  );
}

async function markAllRead(companyId) {
  return Notification.updateMany(
    { companyId, read: false },
    { $set: { read: true } },
  );
}

async function getSmtpSettings(companyId) {
  return SmtpSettings.findOne({ companyId }).lean();
}

async function saveSmtpSettings(companyId, data) {
  return SmtpSettings.findOneAndUpdate(
    { companyId },
    { $set: { ...data, companyId } },
    { upsert: true, returnDocument: "after" },
  );
}

async function testSmtp(companyId) {
  const settings = await SmtpSettings.findOne({ companyId });
  if (!settings) throw new Error("No SMTP settings configured");

  const recipients = settings.recipients || settings.recipients || [];
  await emailSender.send(settings, {
    to: recipients.length ? recipients : [settings.fromEmail],
    subject: "[WMS Linker] SMTP Test",
    text: "This is a test email from WMS Linker. Your SMTP settings are working correctly.",
    html: '<div style="font-family:sans-serif;padding:20px;"><h2>SMTP Test Successful</h2><p>Your email notifications are configured correctly.</p></div>',
  });

  return { success: true };
}

module.exports = {
  create,
  listByCompany,
  listByCompany: listByCompany,
  countUnread,
  countUnread: countUnread,
  markRead,
  markRead: markRead,
  markAllRead,
  markAllRead: markAllRead,
  getSmtpSettings,
  getSmtpSettings: getSmtpSettings,
  saveSmtpSettings,
  saveSmtpSettings: saveSmtpSettings,
  testSmtp,
  testSmtp: testSmtp,
  toPublic,
};
