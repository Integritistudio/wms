const FailedOrder = require("./failedOrderModel");
const logger = require("../../config/logger");

async function create({ orderId, shopId, companyId, reason, errorMessage, warehouseId = null }) {
  const existing = await FailedOrder.findOne({
    orderId,
    resolution: null,
  });

  let resolvedWarehouseId = warehouseId;
  if (!resolvedWarehouseId && orderId) {
    try {
      const Order = require("./model");
      const order = await Order.findById(orderId);
      if (order?.warehouseId) {
        resolvedWarehouseId = order.warehouseId;
      }
    } catch {
      /* ignore lookup error */
    }
  }

  if (existing) {
    existing.attempts += 1;
    existing.errorMessage = errorMessage || existing.errorMessage;
    if (resolvedWarehouseId && !existing.warehouseId) {
      existing.warehouseId = resolvedWarehouseId;
    }
    await existing.save();
    return existing;
  }

  const entry = await FailedOrder.create({
    orderId,
    shopId,
    companyId,
    warehouseId: resolvedWarehouseId,
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listByCompany(companyId, { resolved = false, q, page, limit, warehouseIds = null } = {}) {
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const filter = { companyId };
  if (!resolved) {
    filter.resolution = null;
  }
  if (warehouseIds && warehouseIds.length) {
    filter.warehouseId = { $in: warehouseIds };
  }
  if (typeof q === "string" && q.trim()) {
    const re = new RegExp(escapeRegex(q.trim()), "i");
    filter.$or = [{ reason: re }, { errorMessage: re }, { resolvedBy: re }];
  }

  const skip = (pageNum - 1) * limitNum;
  const [total, entries] = await Promise.all([
    FailedOrder.countDocuments(filter),
    FailedOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
  ]);

  return {
    items: entries.map((e) => e.toPublic()),
    total,
    page: pageNum,
    limit: limitNum,
  };
}

async function countByCompany(companyId, warehouseIds = null) {
  const filter = { companyId, resolution: null };
  if (warehouseIds && warehouseIds.length) {
    filter.warehouseId = { $in: warehouseIds };
  }
  return FailedOrder.countDocuments(filter);
}

async function resolve(id, { resolution, resolvedBy } = {}) {
  const entry = await FailedOrder.findById(id);
  if (!entry) {
    const error = new Error("DLQ entry not found");
    error.statusCode = 404;
    throw error;
  }
  const mapped = {
    retried: "retried",
    reassigned: "reassigned",
    skipped: "skipped",
  }[resolution] || resolution || "retried";
  entry.resolution = mapped;
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
