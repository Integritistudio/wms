const ActivityLog = require("./model");
const auditMs = require("../auditMs/client");
const logger = require("../../config/logger");

function mapMsItem(item) {
  if (!item) return null;
  return {
    id: String(item.id),
    type: item.type,
    orderId: item.orderId || null,
    warehouseId: item.warehouseId || null,
    companyId: item.companyId || null,
    fromState: item.fromState || "",
    toState: item.toState || "",
    message: item.message || "",
    meta: item.meta || {},
    createdAt: item.createdAt,
  };
}

async function appendMs(companyId, payload) {
  if (!companyId || !auditMs.enabled()) return null;
  try {
    return mapMsItem(await auditMs.append(String(companyId), payload));
  } catch (err) {
    logger.warn({ err, companyId: String(companyId) }, "Audit-ms append failed");
    return null;
  }
}

async function logOrderTransition({
  orderId,
  companyId,
  fromState,
  toState,
  message,
  meta,
}) {
  const payload = {
    type: "order_flow",
    orderId: orderId ? String(orderId) : undefined,
    fromState: fromState || "",
    toState: toState || "",
    message: message || `${fromState} → ${toState}`,
    meta: meta || {},
  };
  const remote = await appendMs(companyId, payload);
  if (remote) return remote;

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

function titleCaseWords(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SHOPIFY_MUTATION_MESSAGES = {
  fulfillmentOrderReportProgress: "Reported fulfillment progress to Shopify",
  fulfillmentCreate: "Created Shopify fulfillment",
  fulfillmentCreateV2: "Created Shopify fulfillment",
  fulfillmentTrackingInfoUpdate: "Updated Shopify tracking",
  fulfillmentTrackingInfoUpdateV2: "Updated Shopify tracking",
  fulfillmentEventCreate: "Recorded Shopify fulfillment event",
  orderClose: "Closed order on Shopify",
  orderOpen: "Reopened order on Shopify",
};

function shopifyApiMessage(mutation, status) {
  const action =
    SHOPIFY_MUTATION_MESSAGES[mutation] ||
    (mutation
      ? `Ran Shopify action: ${titleCaseWords(mutation)}`
      : "Ran Shopify action");
  const key = String(status || "").toLowerCase();
  if (key === "success" || key === "ok" || key === "succeeded") {
    return `${action}.`;
  }
  if (key === "error" || key === "failed" || key === "fail") {
    return `${action} failed.`;
  }
  return `${action} (${titleCaseWords(status)}).`;
}

function sftpDeliveryMessage(status, filename) {
  const file = filename || "file";
  const key = String(status || "").toLowerCase();
  if (key === "success" || key === "ok" || key === "succeeded") {
    return `Warehouse file ${file} uploaded successfully.`;
  }
  if (key === "error" || key === "failed" || key === "fail") {
    return `Warehouse file ${file} upload failed.`;
  }
  return `Warehouse file ${file}: ${titleCaseWords(status)}.`;
}

async function logSftpDelivery({
  orderId,
  warehouseId,
  companyId,
  filename,
  status,
  duration,
  bytes,
  error,
}) {
  const message = sftpDeliveryMessage(status, filename);
  const payload = {
    type: "sftp_delivery",
    orderId: orderId ? String(orderId) : undefined,
    warehouseId: warehouseId ? String(warehouseId) : undefined,
    message,
    meta: { filename, status, duration, bytes, error },
  };
  const remote = await appendMs(companyId, payload);
  if (remote) return remote;

  return ActivityLog.create({
    type: "sftp_delivery",
    orderId,
    warehouseId,
    companyId,
    message,
    meta: { filename, status, duration, bytes, error },
  });
}

async function logShopifyApi({
  orderId,
  companyId,
  mutation,
  status,
  userErrors,
  duration,
  meta,
}) {
  const message = shopifyApiMessage(mutation, status);
  const payload = {
    type: "shopify_api",
    orderId: orderId ? String(orderId) : undefined,
    message,
    meta: { mutation, status, userErrors, duration, ...(meta || {}) },
  };
  const remote = await appendMs(companyId, payload);
  if (remote) return remote;

  return ActivityLog.create({
    type: "shopify_api",
    orderId,
    companyId,
    message,
    meta: { mutation, status, userErrors, duration, ...(meta || {}) },
  });
}

async function listForOrder(orderId, companyId = null) {
  if (auditMs.enabled() && companyId) {
    try {
      const items = await auditMs.listForOrder(String(companyId), String(orderId));
      return items.map(mapMsItem);
    } catch (err) {
      logger.warn({ err }, "Audit-ms listForOrder failed; falling back to Mongo");
    }
  }
  const logs = await ActivityLog.find({ orderId }).sort({ createdAt: -1 }).limit(100);
  return logs.map((l) => l.toPublic());
}

module.exports = {
  logOrderTransition,
  logSftpDelivery,
  logShopifyApi,
  listForOrder,
};
