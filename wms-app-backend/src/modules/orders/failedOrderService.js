const FailedOrder = require("./failedOrderModel");
const logger = require("../../config/logger");

async function create({ orderId, shopId, companyId, reason, errorMessage }) {
  const existing = await FailedOrder.findOne({
    orderId,
    resolution: null,
  });

  if (existing) {
    existing.attempts += 1;
    existing.errorMessage = errorMessage || existing.errorMessage;
    await existing.save();
    return existing;
  }

  const entry = await FailedOrder.create({
    orderId,
    shopId,
    companyId,
    reason,
    errorMessage: errorMessage || "",
  });

  logger.warn({ orderId: String(orderId), reason }, "DLQ entry created");

  const notifications = require("../notifications");
  notifications.create({
    companyId,
    type: "dlq_entry",
    title: `Order failed: ${reason}`,
    message: errorMessage || `Order ${orderId} entered the dead letter queue (${reason})`,
    meta: { orderId: String(orderId), reason },
  }).catch(() => {});
  return entry;
}

async function listByCompany(companyId, { resolved = false } = {}) {
  const filter = { companyId };
  if (!resolved) {
    filter.resolution = null;
  }
  return FailedOrder.find(filter).sort({ createdAt: -1 }).limit(200);
}

async function countByCompany(companyId) {
  return FailedOrder.countDocuments({ companyId, resolution: null });
}

async function resolve(id, { resolution, resolvedBy }) {
  const entry = await FailedOrder.findById(id);
  if (!entry) {
    const error = new Error("DLQ entry not found");
    error.statusCode = 404;
    throw error;
  }
  entry.resolution = resolution;
  entry.resolvedBy = resolvedBy || "";
  entry.resolvedAt = new Date();
  await entry.save();
  return entry;
}

async function getById(id) {
  const entry = await FailedOrder.findById(id);
  if (!entry) {
    const error = new Error("DLQ entry not found");
    error.statusCode = 404;
    throw error;
  }
  return entry;
}

module.exports = {
  create,
  listByCompany,
  countByCompany,
  resolve,
  getById,
};
