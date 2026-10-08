const FailedOrder = require("./failedOrderModel");
const logger = require("../../config/logger");
const failedMs = require("../failedMs/client");

function useFailedMs() {
  return failedMs.enabled();
}

function mapReason(reason) {
  const allowed = new Set([
    "HMAC_FAIL",
    "MAPPING_EXCEPTION",
    "SFTP_ERROR",
    "SHOPIFY_ERROR",
    "PRODUCT_NOT_FOUND",
    "ROUTING_NO_MATCH",
    "MODERNWMS_ERROR",
    "UNKNOWN",
  ]);
  return allowed.has(reason) ? reason : "UNKNOWN";
}

async function create({ orderId, shopId, companyId, reason, errorMessage, warehouseId = null }) {
  let resolvedWarehouseId = warehouseId;
  if (!resolvedWarehouseId && orderId) {
    try {
      const Order = require("./model");
      const order = await Order.findById(orderId);
      if (order?.warehouseId) {
        resolvedWarehouseId = order.warehouseId;
      }
    } catch {
      /* ignore */
    }
  }

  if (useFailedMs()) {
    try {
      const entry = await failedMs.ingest({
        orderId: String(orderId),
        shopId: String(shopId),
        companyId: String(companyId),
        warehouseId: resolvedWarehouseId ? String(resolvedWarehouseId) : null,
        reason: mapReason(reason),
        errorMessage: errorMessage || "",
      });

      const notifications = require("../notifications");
      notifications
        .create({
          companyId,
          type: "dlq_entry",
          title: `Order failed: ${reason}`,
          message:
            errorMessage || `Order ${orderId} entered the dead letter queue (${reason})`,
          meta: { orderId: String(orderId), reason, failedMsId: entry?.id },
        })
        .catch(() => {});

      return {
        _id: entry.id,
        ...entry,
        toPublic() {
          return entry;
        },
      };
    } catch (err) {
      logger.error({ err }, "Failed-ms ingest failed; falling back to Mongo DLQ");
    }
  }

  const existing = await FailedOrder.findOne({
    orderId,
    resolution: null,
  });

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
  notifications
    .create({
      companyId,
      type: "dlq_entry",
      title: `Order failed: ${reason}`,
      message:
        errorMessage || `Order ${orderId} entered the dead letter queue (${reason})`,
      meta: { orderId: String(orderId), reason },
    })
    .catch(() => {});
  return entry;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listByCompany(companyId, { resolved = false, q, page, limit, warehouseIds = null, reason } = {}) {
  if (useFailedMs()) {
    try {
      return await failedMs.list(String(companyId), {
        resolved,
        q,
        page,
        limit,
        warehouseIds,
        reason,
      });
    } catch (err) {
      logger.error({ err }, "Failed-ms list failed; falling back to Mongo");
    }
  }

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
  if (useFailedMs()) {
    try {
      const data = await failedMs.count(String(companyId), warehouseIds);
      return Number(data?.count ?? 0);
    } catch (err) {
      logger.error({ err }, "Failed-ms count failed; falling back to Mongo");
    }
  }

  const filter = { companyId, resolution: null };
  if (warehouseIds && warehouseIds.length) {
    filter.warehouseId = { $in: warehouseIds };
  }
  return FailedOrder.countDocuments(filter);
}

async function resolve(id, { resolution, resolvedBy, companyId } = {}) {
  if (useFailedMs() && companyId) {
    try {
      const entry = await failedMs.resolve(String(companyId), String(id), {
        resolution,
        resolvedBy,
      });
      return {
        _id: entry.id,
        ...entry,
        companyId: entry.companyId,
        orderId: entry.orderId,
        warehouseId: entry.warehouseId,
      };
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }
  }

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

async function getById(id, companyId = null) {
  if (useFailedMs() && companyId) {
    try {
      const entry = await failedMs.getById(String(companyId), String(id));
      return {
        _id: entry.id,
        id: entry.id,
        companyId: entry.companyId,
        orderId: entry.orderId,
        shopId: entry.shopId,
        warehouseId: entry.warehouseId,
        reason: entry.reason,
        errorMessage: entry.errorMessage,
        attempts: entry.attempts,
        resolution: entry.resolution,
        resolvedAt: entry.resolvedAt,
        resolvedBy: entry.resolvedBy,
        nextRetryAt: entry.nextRetryAt,
        autoRetryEnabled: entry.autoRetryEnabled,
        status: entry.status,
      };
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }
  }

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
  useFailedMs,
};
