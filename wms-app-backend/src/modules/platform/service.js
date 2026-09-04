const bcrypt = require("bcrypt");
const env = require("../../config/env");
const logger = require("../../config/logger");
const { signToken, AUDIENCE } = require("../../utils/jwt");
const { assertRequiredFields } = require("../../utils/validators");
const { httpError } = require("../../utils/httpError");
const PlatformAdmin = require("./model");
const PlatformSetting = require("./settingModel");
const rateLimit = require("./rateLimit");

async function seedPlatformAdmin() {
  const username = env.platformAdminUsername;
  const existing = await PlatformAdmin.findOne({ username });

  if (existing) {
    return existing;
  }

  const password = await bcrypt.hash(env.platformAdminPassword, 10);
  const admin = await PlatformAdmin.create({
    username,
    password,
    isActive: true,
  });

  logger.info({ username }, "Seeded platform admin");
  return admin;
}

async function login(request, { username, password }) {
  const limited = rateLimit.hit(request);
  if (!limited.ok) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }

  assertRequiredFields({ username, password }, ["username", "password"]);

  const admin = await PlatformAdmin.findOne({
    username: String(username).trim().toLowerCase(),
  });

  if (!admin || !admin.isActive) {
    throw httpError(401, "Invalid credentials");
  }

  const matches = await bcrypt.compare(password, admin.password);
  if (!matches) {
    throw httpError(401, "Invalid credentials");
  }

  rateLimit.clear(request);

  return {
    token: signToken({ sub: admin._id.toString(), username: admin.username }, { audience: AUDIENCE.platformAdmin }),
    user: admin.toPublic(),
  };
}

async function getOrCreateSettings() {
  let settings = await PlatformSetting.findOne({ key: "platform_settings" });
  if (!settings) {
    settings = await PlatformSetting.create({
      key: "platform_settings",
      retentionDays: 180,
      autoCleanupEnabled: true,
    });
  }
  return settings;
}

async function getSettings() {
  const settings = await getOrCreateSettings();
  return settings.toPublic();
}

async function updateSettings(payload = {}) {
  const settings = await getOrCreateSettings();
  if (payload.retentionDays !== undefined) {
    settings.retentionDays = Math.max(1, Number(payload.retentionDays) || 180);
  }
  if (payload.autoCleanupEnabled !== undefined) {
    settings.autoCleanupEnabled = Boolean(payload.autoCleanupEnabled);
  }
  if (payload.webhooksEnabled !== undefined) {
    settings.webhooksEnabled = Boolean(payload.webhooksEnabled);
  }
  if (payload.dlqAlertEmail !== undefined) {
    settings.dlqAlertEmail = String(payload.dlqAlertEmail || "").trim();
  }
  if (payload.dlqAlertThreshold !== undefined) {
    settings.dlqAlertThreshold = Math.max(1, Number(payload.dlqAlertThreshold) || 5);
  }
  await settings.save();
  return settings.toPublic();
}

async function areWebhooksEnabled() {
  if (!env.webhooksEnabled) {
    return false;
  }
  const settings = await getOrCreateSettings();
  return settings.webhooksEnabled !== false;
}

async function runRetentionCleanup(customRetentionDays = null) {
  const settings = await getOrCreateSettings();
  const retentionDays = customRetentionDays != null ? Math.max(1, Number(customRetentionDays)) : settings.retentionDays || 180;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const Company = require("../companies/model");
  const CompanyMember = require("../companies/memberModel");
  const Warehouse = require("../companies/warehouseModel");
  const SftpConnection = require("../companies/sftpConnectionModel");
  const WarehouseTemplate = require("../companies/warehouseTemplateModel");
  const FailedOrder = require("../orders/failedOrderModel");
  const Return = require("../fulfillment/returnModel");
  const Shop = require("../shops/model");

  // 1. Purge soft-deleted companies older than cutoff
  const expiredCompanies = await Company.find({
    isDeleted: true,
    deletedAt: { $lte: cutoffDate },
  });

  let deletedCompaniesCount = 0;
  for (const comp of expiredCompanies) {
    const compId = comp._id;
    await Promise.all([
      CompanyMember.deleteMany({ companyId: compId }),
      Warehouse.deleteMany({ companyId: compId }),
      SftpConnection.deleteMany({ companyId: compId }),
      WarehouseTemplate.deleteMany({ companyId: compId }),
      FailedOrder.deleteMany({ companyId: compId }),
      Return.deleteMany({ companyId: compId }),
      Shop.updateMany({ companyId: compId }, { $set: { companyId: null, warehouseId: null } }),
    ]);
    await Company.deleteOne({ _id: compId });
    deletedCompaniesCount += 1;
  }

  // 2. Purge soft-deleted returns older than cutoff
  const returnResult = await Return.deleteMany({
    isDeleted: true,
    deletedAt: { $lte: cutoffDate },
  });
  const deletedReturnsCount = returnResult.deletedCount || 0;

  const stats = {
    retentionDays,
    cutoffDate: cutoffDate.toISOString(),
    deletedCompanies: deletedCompaniesCount,
    deletedReturns: deletedReturnsCount,
    executedAt: new Date().toISOString(),
  };

  settings.lastCleanupAt = new Date();
  settings.lastCleanupStats = stats;
  await settings.save();

  logger.info(stats, "Executed retention cleanup job");
  return stats;
}

let cleanupIntervalHandle = null;

function startRetentionScheduler() {
  if (cleanupIntervalHandle) return;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  cleanupIntervalHandle = setInterval(async () => {
    try {
      const settings = await getOrCreateSettings();
      if (settings.autoCleanupEnabled) {
        await runRetentionCleanup();
      }
    } catch (err) {
      logger.error({ err }, "Retention cleanup cron error");
    }
  }, TWENTY_FOUR_HOURS);
  if (cleanupIntervalHandle.unref) {
    cleanupIntervalHandle.unref();
  }
}

module.exports = {
  seedPlatformAdmin,
  login,
  getSettings,
  updateSettings,
  areWebhooksEnabled,
  getOrCreateSettings,
  runRetentionCleanup,
  startRetentionScheduler,
};
