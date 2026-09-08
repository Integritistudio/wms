const crypto = require("crypto");
const shops = require("../shops");
const { graphql } = require("./client");
const logs = require("../logs");
const logger = require("../../config/logger");

function normalizeLineId(value) {
  if (value == null || value === "") return "";
  const raw = String(value);
  if (raw.startsWith("gid://")) {
    const parts = raw.split("/");
    return parts[parts.length - 1] || raw;
  }
  return raw;
}

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function requestedQuantitiesByKey(lines = [], orderLines = []) {
  const bySku = new Map();
  const byLineId = new Map();
  const orderById = new Map(
    (orderLines || []).map((l) => [normalizeLineId(l.id || l.orderLineId), l])
  );

  for (const line of lines) {
    let qty = Number(line.allocatedQty ?? line.quantity ?? line.shippedQty ?? 0) || 0;
    if (qty <= 0) continue;

    const lineId = normalizeLineId(line.orderLineId || line.id || line.lineItemId);
    let sku = normalizeSku(line.sku);

    // Resolve SKU from order line when group line SKU is missing
    if (!sku && lineId && orderById.has(lineId)) {
      sku = normalizeSku(orderById.get(lineId).sku);
    }

    if (sku) {
      bySku.set(sku, (bySku.get(sku) || 0) + qty);
    }
    if (lineId) {
      byLineId.set(lineId, (byLineId.get(lineId) || 0) + qty);
    }
  }

  return { bySku, byLineId };
}

function buildPartialLineItems(fulfillmentOrders, lines, orderLines = []) {
  const { bySku, byLineId } = requestedQuantitiesByKey(lines, orderLines);
  if (bySku.size === 0 && byLineId.size === 0) return { items: [], unmatched: [] };

  const remainingBySku = new Map(bySku);
  const remainingByLineId = new Map(byLineId);
  const lineItemsByFulfillmentOrder = [];

  for (const fo of fulfillmentOrders) {
    const fulfillmentOrderLineItems = [];

    for (const node of fo.lineItems?.nodes || []) {
      if (!node?.id || !(node.remainingQuantity > 0)) continue;

      const sku = normalizeSku(node.sku || node.lineItem?.sku);
      const lineItemId = normalizeLineId(node.lineItem?.id);
      let want = 0;

      if (lineItemId && remainingByLineId.has(lineItemId)) {
        want = remainingByLineId.get(lineItemId) || 0;
      } else if (sku && remainingBySku.has(sku)) {
        want = remainingBySku.get(sku) || 0;
      }

      if (want <= 0) continue;

      const quantity = Math.min(want, node.remainingQuantity);
      if (quantity <= 0) continue;

      fulfillmentOrderLineItems.push({ id: node.id, quantity });

      if (lineItemId && remainingByLineId.has(lineItemId)) {
        remainingByLineId.set(lineItemId, Math.max(0, (remainingByLineId.get(lineItemId) || 0) - quantity));
      }
      if (sku && remainingBySku.has(sku)) {
        remainingBySku.set(sku, Math.max(0, (remainingBySku.get(sku) || 0) - quantity));
      }
    }

    if (fulfillmentOrderLineItems.length > 0) {
      lineItemsByFulfillmentOrder.push({
        fulfillmentOrderId: fo.id,
        fulfillmentOrderLineItems,
      });
    }
  }

  const unmatched = [];
  for (const [sku, qty] of remainingBySku) {
    if (qty > 0) unmatched.push({ sku, quantity: qty });
  }

  return { items: lineItemsByFulfillmentOrder, unmatched };
}

function buildAllRemainingLineItems(fulfillmentOrders) {
  return fulfillmentOrders
    .map((item) => ({
      fulfillmentOrderId: item.id,
      fulfillmentOrderLineItems: (item.lineItems?.nodes || [])
        .filter((line) => line.remainingQuantity > 0)
        .map((line) => ({ id: line.id, quantity: line.remainingQuantity })),
    }))
    .filter((item) => item.fulfillmentOrderLineItems.length > 0);
}

function inventoryAvailableSkus(fulfillmentOrders) {
  const skus = new Set();
  for (const fo of fulfillmentOrders) {
    for (const node of fo.lineItems?.nodes || []) {
      if (!(node.remainingQuantity > 0)) continue;
      const sku = normalizeSku(node.sku || node.lineItem?.sku);
      if (sku) skus.add(sku);
      const id = normalizeLineId(node.lineItem?.id);
      if (id) skus.add(`line:${id}`);
    }
  }
  return [...skus];
}

/**
 * Create a Shopify fulfillment.
 * When `lines` is provided (group ship / partial), only those SKUs/qty are fulfilled.
 */
async function createFulfillment({
  shop,
  order,
  lines = null,
  trackingNumber,
  carrier,
  idempotencyKey,
}) {
  const accessToken = await shops.ensureFreshAccessToken(shop);
  const orderGid = order.shopifyOrderId.startsWith("gid://")
    ? order.shopifyOrderId
    : `gid://shopify/Order/${order.shopifyOrderId}`;

  const data = await graphql(
    shop.shopDomain,
    accessToken,
    `query fulfillmentOrders($id: ID!) {
      order(id: $id) {
        displayFulfillmentStatus
        fulfillmentOrders(first: 25) {
          nodes {
            id
            status
            lineItems(first: 100) {
              nodes {
                id
                remainingQuantity
                totalQuantity
                sku
                lineItem { id sku name }
              }
            }
          }
        }
      }
    }`,
    { id: orderGid }
  );

  const allFos = data.order?.fulfillmentOrders?.nodes || [];
  const fulfillmentOrders = allFos.filter(
    (item) => item.status === "OPEN" || item.status === "IN_PROGRESS" || item.status === "SCHEDULED"
  );

  const partial = Array.isArray(lines) && lines.length > 0;
  let lineItemsByFulfillmentOrder;
  let unmatched = [];

  if (partial) {
    const built = buildPartialLineItems(fulfillmentOrders, lines, order.lineItems || []);
    lineItemsByFulfillmentOrder = built.items;
    unmatched = built.unmatched;
  } else {
    lineItemsByFulfillmentOrder = buildAllRemainingLineItems(fulfillmentOrders);
  }

  if (lineItemsByFulfillmentOrder.length === 0) {
    const available = inventoryAvailableSkus(fulfillmentOrders);
    const requested = (lines || [])
      .map((l) => normalizeSku(l.sku) || normalizeLineId(l.orderLineId || l.id))
      .filter(Boolean);
    const detail = partial
      ? `No matching open Shopify lines for this shipment. Requested: [${requested.join(", ") || "none"}]. Available open: [${available.join(", ") || "none"}].`
      : "No open fulfillment orders on Shopify";
    throw new Error(detail);
  }

  const trackNumber = trackingNumber || order.trackingNumber || "";
  const trackCompany = carrier || order.carrier || undefined;
  const trackingInfo = trackNumber
    ? {
        number: trackNumber,
        company: trackCompany || undefined,
      }
    : undefined;

  const key = String(
    idempotencyKey || order.fulfillmentIdempotencyKey || crypto.randomUUID()
  ).slice(0, 255);
  if (order.fulfillmentIdempotencyKey !== key) {
    order.fulfillmentIdempotencyKey = key;
    if (order.save) await order.save();
  }

  // App-level idempotency: store stable key and pass it as Shopify message
  // so retries are correlatable. (fulfillmentCreate does not support @idempotent.)
  const result = await graphql(
    shop.shopDomain,
    accessToken,
    `mutation fulfillmentCreate($fulfillment: FulfillmentInput!, $message: String) {
      fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
        fulfillment { id status }
        userErrors { field message }
      }
    }`,
    {
      fulfillment: {
        notifyCustomer: true,
        trackingInfo,
        lineItemsByFulfillmentOrder,
      },
      message: `idempotency:${key}`,
    }
  );

  const errors = result.fulfillmentCreate?.userErrors || [];
  if (errors.length > 0) {
    const errMsg = errors.map((item) => item.message).join("; ");
    logs.logShopifyApi({
      orderId: order._id,
      companyId: shop.companyId,
      mutation: "fulfillmentCreate",
      status: "error",
      userErrors: errors,
    }).catch(() => {});
    try {
      const dlq = require("../orders/failedOrderService");
      await dlq.create({
        orderId: order._id,
        shopId: shop._id,
        companyId: shop.companyId,
        reason: "SHOPIFY_ERROR",
        errorMessage: errMsg,
      });
    } catch { /* best effort */ }
    throw new Error(errMsg);
  }

  const fulfillment = result.fulfillmentCreate.fulfillment;
  logger.info(
    {
      orderId: String(order._id),
      shopifyFulfillmentId: fulfillment?.id,
      partial,
      unmatched,
      groups: lineItemsByFulfillmentOrder.length,
    },
    "Shopify fulfillment created"
  );

  logs.logShopifyApi({
    orderId: order._id,
    companyId: shop.companyId,
    mutation: "fulfillmentCreate",
    status: "success",
    meta: {
      fulfillmentId: fulfillment?.id,
      partial,
      unmatched,
      lineGroups: lineItemsByFulfillmentOrder.length,
    },
  }).catch(() => {});

  if (unmatched.length > 0) {
    logs.logOrderTransition({
      orderId: order._id,
      companyId: shop.companyId,
      fromState: "shopify_fulfill",
      toState: "partial_match",
      message: `Shopify fulfill matched partially; unmatched: ${unmatched.map((u) => `${u.sku}×${u.quantity}`).join(", ")}`,
      meta: { unmatched, fulfillmentId: fulfillment?.id },
    }).catch(() => {});
  }

  return fulfillment;
}

function isFullyAllocated(lines = []) {
  const list = lines || [];
  if (!list.length) return false;
  return list.every((line) => {
    const qty = Number(line.quantity) || 0;
    if (qty <= 0) return true;
    return (Number(line.allocatedQty) || 0) >= qty;
  });
}

/**
 * Mark open Shopify fulfillment orders as in progress after full WMS allocation.
 * Uses fulfillmentOrderReportProgress (Admin API 2026-04+).
 */
async function markOrderInProgress({ shop, order, message }) {
  if (!shop || !order || order.source === "demo") {
    return { updated: 0, skipped: true, reason: "demo_or_missing" };
  }
  if (!shops.isProcessable(shop)) {
    return { updated: 0, skipped: true, reason: "shop_not_processable" };
  }

  const accessToken = await shops.ensureFreshAccessToken(shop);
  const orderGid = order.shopifyOrderId.startsWith("gid://")
    ? order.shopifyOrderId
    : `gid://shopify/Order/${order.shopifyOrderId}`;

  const data = await graphql(
    shop.shopDomain,
    accessToken,
    `query fulfillmentOrdersForProgress($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 25) {
          nodes {
            id
            status
          }
        }
      }
    }`,
    { id: orderGid }
  );

  const nodes = data.order?.fulfillmentOrders?.nodes || [];
  const openOrders = nodes.filter((fo) => fo.status === "OPEN" || fo.status === "IN_PROGRESS");
  if (!openOrders.length) {
    return { updated: 0, skipped: true, reason: "no_open_fulfillment_orders" };
  }

  const notes = String(message || `Allocated in WMS for order ${order.orderNumber || order.shopifyOrderId}`).slice(0, 256);
  let updated = 0;
  const errors = [];

  for (const fo of openOrders) {
    try {
      const result = await graphql(
        shop.shopDomain,
        accessToken,
        `mutation fulfillmentOrderReportProgress($id: ID!, $progressReport: FulfillmentOrderReportProgressInput) {
          fulfillmentOrderReportProgress(id: $id, progressReport: $progressReport) {
            fulfillmentOrder { id status }
            userErrors { field message }
          }
        }`,
        {
          id: fo.id,
          progressReport: { reasonNotes: notes },
        }
      );

      const userErrors = result.fulfillmentOrderReportProgress?.userErrors || [];
      if (userErrors.length) {
        errors.push({
          fulfillmentOrderId: fo.id,
          error: userErrors.map((e) => e.message).join("; "),
        });
        continue;
      }

      updated += 1;
      logs.logShopifyApi({
        orderId: order._id,
        companyId: shop.companyId,
        mutation: "fulfillmentOrderReportProgress",
        status: "success",
        meta: {
          fulfillmentOrderId: fo.id,
          shopifyStatus: result.fulfillmentOrderReportProgress?.fulfillmentOrder?.status,
        },
      }).catch(() => {});
    } catch (error) {
      errors.push({ fulfillmentOrderId: fo.id, error: error.message || String(error) });
      logs.logShopifyApi({
        orderId: order._id,
        companyId: shop.companyId,
        mutation: "fulfillmentOrderReportProgress",
        status: "error",
        userErrors: [{ message: error.message || String(error) }],
      }).catch(() => {});
    }
  }

  if (updated > 0) {
    logs.logOrderTransition({
      orderId: order._id,
      companyId: shop.companyId,
      fromState: "allocated",
      toState: "shopify_in_progress",
      message: `Marked ${updated} Shopify fulfillment order(s) in progress`,
      meta: { updated, errors },
    }).catch(() => {});
  }

  return { updated, skipped: false, errors };
}

module.exports = {
  createFulfillment,
  markOrderInProgress,
  isFullyAllocated,
  createFulfillmentTrackingEvent,
  mapShipmentStatusToShopifyEvent,
};

function mapShipmentStatusToShopifyEvent(status) {
  const map = {
    pending: "CONFIRMED",
    labeled: "LABEL_PRINTED",
    in_transit: "IN_TRANSIT",
    out_for_delivery: "OUT_FOR_DELIVERY",
    delivered: "DELIVERED",
    failed: "FAILURE",
    returned: "FAILURE",
  };
  return map[status] || null;
}

/**
 * Push a tracking/status event onto an existing Shopify fulfillment.
 */
async function createFulfillmentTrackingEvent({
  shop,
  order,
  shopifyFulfillmentId,
  status,
  message,
  happenedAt,
}) {
  if (!shopifyFulfillmentId || order?.source === "demo") {
    return { skipped: true, reason: "no_fulfillment" };
  }
  if (!shops.isProcessable(shop)) {
    return { skipped: true, reason: "shop_not_processable" };
  }

  const shopifyStatus = mapShipmentStatusToShopifyEvent(status);
  if (!shopifyStatus) {
    return { skipped: true, reason: "unmapped_status" };
  }

  let fulfillmentId = String(shopifyFulfillmentId);
  if (!fulfillmentId.startsWith("gid://")) {
    // Accept numeric ids or leftover idempotency placeholders
    if (/^\d+$/.test(fulfillmentId)) {
      fulfillmentId = `gid://shopify/Fulfillment/${fulfillmentId}`;
    } else if (!fulfillmentId.includes("Fulfillment")) {
      return { skipped: true, reason: "invalid_fulfillment_id" };
    }
  }

  const accessToken = await shops.ensureFreshAccessToken(shop);
  const result = await graphql(
    shop.shopDomain,
    accessToken,
    `mutation fulfillmentEventCreate($fulfillmentEvent: FulfillmentEventInput!) {
      fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
        fulfillmentEvent { id status happenedAt message }
        userErrors { field message }
      }
    }`,
    {
      fulfillmentEvent: {
        fulfillmentId,
        status: shopifyStatus,
        message: String(message || status).slice(0, 255),
        happenedAt: happenedAt ? new Date(happenedAt).toISOString() : new Date().toISOString(),
      },
    }
  );

  const errors = result.fulfillmentEventCreate?.userErrors || [];
  if (errors.length) {
    const errMsg = errors.map((e) => e.message).join("; ");
    logs.logShopifyApi({
      orderId: order?._id,
      companyId: shop.companyId,
      mutation: "fulfillmentEventCreate",
      status: "error",
      userErrors: errors,
    }).catch(() => {});
    throw new Error(errMsg);
  }

  logs.logShopifyApi({
    orderId: order?._id,
    companyId: shop.companyId,
    mutation: "fulfillmentEventCreate",
    status: "success",
    meta: {
      fulfillmentId,
      shopifyStatus,
      eventId: result.fulfillmentEventCreate?.fulfillmentEvent?.id,
    },
  }).catch(() => {});

  return {
    skipped: false,
    event: result.fulfillmentEventCreate?.fulfillmentEvent || null,
    shopifyStatus,
  };
}
