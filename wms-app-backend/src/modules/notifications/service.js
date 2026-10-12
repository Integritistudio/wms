const Notification = require("./model");
const Company = require("../companies/model");
const members = require("../companies/members");
const SmtpSettings = require("./smtpModel");
const emailSender = require("./emailSender");
const logger = require("../../config/logger");
const notifyMs = require("../notifyMs/client");
const emailMs = require("../emailMs/client");

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
  "inventory_reverted",
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
    _id: String(row._id || row.id),
    id: String(row._id || row.id),
    companyId: String(row.companyId || ""),
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

function mapMsItem(item, companyId) {
  if (!item) return null;
  return {
    _id: String(item.id || item._id),
    id: String(item.id || item._id),
    companyId: String(companyId),
    type: item.type,
    title: item.title,
    message: item.message || "",
    meta: item.meta || {},
    read: Boolean(item.read),
    emailSent: false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function create(payload = {}) {
  const companyId = payload.companyId || payload.companyId;
  if (!companyId) return null;

  const type = normalizeType(payload.type);
  const title = payload.title || "Notification";
  const message = payload.message || "";
  const meta = payload.meta || {};

  let userId = payload.userId || null;
  if (!userId) {
    try {
      const company = await Company.findById(companyId);
      if (company) {
        const rootMember = await members.ensureRootMember(company);
        if (rootMember) userId = rootMember._id;
      }
    } catch {
      // ignore
    }
  }

  if (notifyMs.enabled()) {
    try {
      const created = await notifyMs.create(String(companyId), {
        type,
        title,
        message,
        meta,
        userId: userId ? String(userId) : undefined,
        channels: ["in_app", "push"],
        idempotencyKey: payload.idempotencyKey,
      });
      sendEmailIfConfigured(companyId, type, title, message).catch(() => {});
      return mapMsItem(created, companyId);
    } catch (err) {
      logger.warn(
        { err, companyId: String(companyId) },
        "Notify-ms create failed; falling back to Mongo",
      );
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

    const notifyOn = settings.notifyOn || [];
    if (Array.isArray(notifyOn) && notifyOn.length && !notifyOn.includes(type)) {
      const aliases = Object.entries(TYPE_ALIASES)
        .filter(([, canonical]) => canonical === type)
        .map(([alias]) => alias);
      if (!aliases.some((alias) => notifyOn.includes(alias))) return;
    }

    const recipients = settings.recipients || [];
    if (!recipients.length) return;

    const subject = `[WMS Linker] ${title}`;
    const text = message || title;
    const html = `<div style="font-family:sans-serif;padding:20px;"><h2 style="color:#1a1a2e;">${title}</h2><p style="color:#444;">${message || ""}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0;"><p style="color:#999;font-size:12px;">WMS Linker Notification — ${type}</p></div>`;

    if (emailMs.enabled()) {
      await emailMs.send(String(companyId), {
        to: recipients,
        subject,
        text,
        html,
        idempotencyKey: `notif-${type}-${Date.now()}`,
      });
    } else {
      await emailSender.send(settings, { to: recipients, subject, text, html });
    }

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
  if (notifyMs.enabled()) {
    try {
      const data = await notifyMs.list(String(companyId), {
        unreadOnly,
        page,
        limit,
      });
      return {
        items: (data.items || []).map((i) => mapMsItem(i, companyId)),
        total: data.total || 0,
        page: data.page || 1,
        limit: data.limit || 25,
      };
    } catch (err) {
      logger.warn(
        { err, companyId: String(companyId) },
        "Notify-ms list failed; falling back to Mongo",
      );
    }
  }

  purgeExpiredRead(companyId).catch(() => {});

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
  if (notifyMs.enabled()) {
    try {
      return await notifyMs.countUnread(String(companyId));
    } catch (err) {
      logger.warn(
        { err, companyId: String(companyId) },
        "Notify-ms count failed; falling back to Mongo",
      );
    }
  }
  return Notification.countDocuments({ companyId, read: false });
}

const READ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

async function purgeExpiredRead(companyId = null) {
  const cutoff = new Date(Date.now() - READ_RETENTION_MS);
  const filter = {
    read: true,
    $or: [
      { readAt: { $ne: null, $lte: cutoff } },
      { readAt: null, updatedAt: { $lte: cutoff } },
      { readAt: null, updatedAt: null, createdAt: { $lte: cutoff } },
    ],
  };
  if (companyId) filter.companyId = companyId;
  const result = await Notification.deleteMany(filter);
  return result?.deletedCount || 0;
}

async function markRead(id, companyId = null) {
  if (notifyMs.enabled() && companyId) {
    try {
      return mapMsItem(await notifyMs.markRead(String(companyId), String(id)), companyId);
    } catch (err) {
      logger.warn({ err }, "Notify-ms markRead failed; falling back to Mongo");
    }
  }
  return Notification.findByIdAndUpdate(
    id,
    { read: true, readAt: new Date() },
    { returnDocument: "after" },
  );
}

async function markAllRead(companyId) {
  if (notifyMs.enabled()) {
    try {
      return await notifyMs.markAllRead(String(companyId));
    } catch (err) {
      logger.warn({ err }, "Notify-ms markAllRead failed; falling back to Mongo");
    }
  }
  return Notification.updateMany(
    { companyId, read: false },
    { $set: { read: true, readAt: new Date() } },
  );
}

function mapSmtpPublic(mongoRow, msSmtp) {
  const raw = mongoRow
    ? typeof mongoRow.toObject === "function"
      ? mongoRow.toObject()
      : { ...mongoRow }
    : {};
  const base = {
    host: raw.host || "",
    port: raw.port ?? 587,
    secure: Boolean(raw.secure),
    username: raw.username || "",
    password: "",
    fromName: raw.fromName || "WMS Linker",
    fromEmail: raw.fromEmail || "",
    enabled: raw.enabled !== false,
    notifyOn: Array.isArray(raw.notifyOn)
      ? raw.notifyOn
      : ["order_error", "sftp_failed", "dlq_entry"],
    recipients: Array.isArray(raw.recipients) ? raw.recipients : [],
    allowPlatformSmtpFallback: true,
    ...raw,
  };
  if (msSmtp?.smtp) {
    base.host = msSmtp.smtp.host || base.host || "";
    base.port = msSmtp.smtp.port ?? base.port ?? 587;
    base.secure = Boolean(msSmtp.smtp.secure ?? base.secure);
    base.fromEmail = msSmtp.smtp.fromAddress || base.fromEmail || "";
    base.fromName = msSmtp.smtp.fromName || base.fromName || "WMS Linker";
    base.usernameSet = Boolean(msSmtp.smtp.usernameSet);
    base.passwordSet = Boolean(msSmtp.smtp.passwordSet);
    base.password = "";
  }
  if (msSmtp?.tenant) {
    base.allowPlatformSmtpFallback =
      msSmtp.tenant.allowPlatformSmtpFallback !== false;
  }
  return base;
}

async function getSmtpSettings(companyId) {
  const mongo = await SmtpSettings.findOne({ companyId }).lean();
  if (!emailMs.enabled()) {
    return mapSmtpPublic(mongo, null);
  }
  try {
    const ms = await emailMs.getSmtp(String(companyId));
    return mapSmtpPublic(mongo, ms);
  } catch (err) {
    logger.warn(
      { err, companyId: String(companyId) },
      "Email-ms getSmtp failed; using Mongo",
    );
    return mapSmtpPublic(mongo, null);
  }
}

async function saveSmtpSettings(companyId, data) {
  const update = { ...data, companyId };
  if (!String(update.password || "")) delete update.password;
  if (!String(update.username || "").trim()) delete update.username;
  const saved = await SmtpSettings.findOneAndUpdate(
    { companyId },
    { $set: update },
    { upsert: true, returnDocument: "after" },
  );

  if (emailMs.enabled() && data?.host && (data.fromEmail || data.fromAddress)) {
    try {
      await emailMs.upsertSmtp(String(companyId), {
        host: data.host,
        port: data.port,
        secure: data.secure,
        username: data.username,
        password: data.password,
        fromEmail: data.fromEmail || data.fromAddress,
        fromName: data.fromName,
      });
      if (typeof data.allowPlatformSmtpFallback === "boolean") {
        await emailMs.setPlatformFallback(
          String(companyId),
          data.allowPlatformSmtpFallback,
        );
      }
    } catch (err) {
      logger.warn(
        { err, companyId: String(companyId) },
        "Email-ms upsertSmtp failed; Mongo saved",
      );
    }
  }

  return saved;
}

function smtpTestError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function testSmtp(companyId, overrides = {}) {
  const settings = (await SmtpSettings.findOne({ companyId })) || {};

  // Prefer form overrides so Test works before/without a save.
  // Blank password keeps the stored secret (the form never receives it back).
  const smtp = {
    host: String(overrides.host || settings.host || "").trim(),
    port: Number(overrides.port || settings.port || 587),
    secure: Boolean(
      overrides.secure !== undefined ? overrides.secure : settings.secure,
    ),
    username: String(overrides.username || settings.username || "").trim(),
    password: String(overrides.password || settings.password || ""),
    fromName: String(overrides.fromName || settings.fromName || "WMS Linker"),
    fromEmail: String(overrides.fromEmail || settings.fromEmail || "").trim(),
  };

  if (!smtp.host || !smtp.fromEmail) {
    throw smtpTestError("SMTP Host and From Email are required");
  }

  const recipients = (
    Array.isArray(overrides.recipients)
      ? overrides.recipients
      : settings.recipients || []
  )
    .map((e) => String(e || "").trim())
    .filter(Boolean);

  const to = recipients.length > 0 ? recipients : [smtp.fromEmail];

  if (emailMs.enabled()) {
    try {
      const result = await emailMs.testSend(String(companyId), {
        to,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        username: smtp.username,
        password: smtp.password,
        fromEmail: smtp.fromEmail,
        fromName: smtp.fromName,
      });
      return { success: true, to: result?.to || to };
    } catch (err) {
      const status = Number(err?.statusCode) || 0;
      if (status === 401) {
        throw smtpTestError(
          "Email service rejected the admin secret. EMAIL_MS_ADMIN_SECRET on the backend must match ADMIN_API_SECRET on the email service.",
        );
      }
      throw smtpTestError(err?.message || "SMTP test failed");
    }
  }

  if (!smtp.username || !smtp.password) {
    throw smtpTestError(
      "SMTP Username and Password are required for the test send",
    );
  }

  try {
    await emailSender.send(smtp, {
      to,
      subject: "[WMS Linker] SMTP Test",
      text: "This is a test email from WMS Linker. Your SMTP settings are working correctly.",
      html: '<div style="font-family:sans-serif;padding:20px;"><h2>SMTP Test Successful</h2><p>Your email notifications are configured correctly.</p></div>',
    });
  } catch (err) {
    throw smtpTestError(err?.message || "SMTP test failed");
  }

  return { success: true, to };
}

module.exports = {
  create,
  listByCompany,
  countUnread,
  markRead,
  markAllRead,
  purgeExpiredRead,
  getSmtpSettings,
  saveSmtpSettings,
  testSmtp,
  toPublic,
};
