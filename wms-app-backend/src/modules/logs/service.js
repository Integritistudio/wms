const ActivityLog = require("./model");

async function logOrderTransition({ orderId, companyId, fromState, toState, message, meta }) {
  return ActivityLog.create({
    type: "order_flow",
    orderId,
    companyId,
    fromState: fromState || "",
    toState: toState || "",
    message: message || `${fromState} → ${toState}`,
    meta,
  });
}

async function logSftpDelivery({ orderId, warehouseId, companyId, filename, status, duration, bytes, error }) {
  return ActivityLog.create({
    type: "sftp_delivery",
    orderId,
    warehouseId,
    companyId,
    message: `SFTP ${status}: ${filename}`,
    meta: { filename, status, duration, bytes, error },
  });
}

async function logShopifyApi({ orderId, companyId, mutation, status, userErrors, duration }) {
  return ActivityLog.create({
    type: "shopify_api",
    orderId,
    companyId,
    message: `${mutation} ${status}`,
    meta: { mutation, status, userErrors, duration },
  });
}

async function listForOrder(orderId) {
  const logs = await ActivityLog.find({ orderId }).sort({ createdAt: -1 }).limit(100);
  return logs.map((l) => l.toPublic());
}

module.exports = {
  logOrderTransition,
  logSftpDelivery,
  logShopifyApi,
  listForOrder,
};
