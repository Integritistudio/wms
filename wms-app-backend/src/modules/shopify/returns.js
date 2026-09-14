const shops = require("../shops");
const logs = require("../logs");
const logger = require("../../config/logger");

function toOrderGid(shopifyOrderId) {
  const raw = String(shopifyOrderId || "").trim();
  if (!raw) return "";
  if (raw.startsWith("gid://")) return raw;
  return `gid://shopify/Order/${raw}`;
}

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeLineId(value) {
  if (value == null || value === "") return "";
  const raw = String(value);
  if (raw.startsWith("gid://")) {
    const parts = raw.split("/");
    return parts[parts.length - 1] || raw;
  }
  return raw;
}

async function loadFulfillmentLineItems(shop, orderGid) {
  const data = await shops.shopifyGraphql(
    shop,
    `query returnableFulfillmentLines($id: ID!) {
      order(id: $id) {
        id
        fulfillments(first: 20) {
          id
          status
          fulfillmentLineItems(first: 100) {
            nodes {
              id
              quantity
              lineItem {
                id
                sku
                name
              }
            }
          }
        }
      }
    }`,
    { id: orderGid }
  );

  const items = [];
  for (const fulfillment of data.order?.fulfillments || []) {
    for (const node of fulfillment.fulfillmentLineItems?.nodes || []) {
      if (!node?.id || !(node.quantity > 0)) continue;
      items.push({
        fulfillmentLineItemId: node.id,
        quantity: Number(node.quantity) || 0,
        lineItemId: normalizeLineId(node.lineItem?.id),
        sku: normalizeSku(node.lineItem?.sku),
      });
    }
  }
  return items;
}

function buildReturnLineItems(fulfillmentLines, returnLines) {
  const remaining = fulfillmentLines.map((row) => ({ ...row, left: row.quantity }));
  const built = [];
  const unmatched = [];

  for (const line of returnLines || []) {
    let want = Math.max(0, Number(line.quantity) || 0);
    if (want <= 0) continue;
    const sku = normalizeSku(line.sku);
    const lineId = normalizeLineId(line.orderLineId || line.id);

    for (const row of remaining) {
      if (want <= 0) break;
      if (row.left <= 0) continue;
      const skuMatch = sku && row.sku && row.sku === sku;
      const idMatch = lineId && row.lineItemId && row.lineItemId === lineId;
      if (!skuMatch && !idMatch) continue;
      const qty = Math.min(want, row.left);
      if (qty <= 0) continue;
      built.push({
        fulfillmentLineItemId: row.fulfillmentLineItemId,
        quantity: qty,
        returnReason: "OTHER",
      });
      row.left -= qty;
      want -= qty;
    }

    if (want > 0) {
      unmatched.push({ sku: line.sku, quantity: want, orderLineId: line.orderLineId || "" });
    }
  }

  return { items: built, unmatched };
}

/**
 * Open a Shopify return (partial) or cancel the Shopify order (full return).
 * Never throws to the caller — failures are logged and returned.
 */
async function syncReturnOpened({ shop, order, returnDoc, isFullReturn }) {
  if (!shop || !shops.isProcessable(shop) || order?.source === "demo") {
    return { skipped: true, reason: "demo_or_shop_not_processable" };
  }

  const orderGid = toOrderGid(order.shopifyOrderId);
  if (!orderGid) return { skipped: true, reason: "missing_shopify_order_id" };

  const meta = { ...(returnDoc.metadata || {}) };

  try {
    if (isFullReturn) {
      const result = await shops.shopifyGraphql(
        shop,
        `mutation orderCancel(
          $orderId: ID!
          $notifyCustomer: Boolean
          $refundMethod: OrderCancelRefundMethodInput!
          $restock: Boolean!
          $reason: OrderCancelReason!
          $staffNote: String
        ) {
          orderCancel(
            orderId: $orderId
            notifyCustomer: $notifyCustomer
            refundMethod: $refundMethod
            restock: $restock
            reason: $reason
            staffNote: $staffNote
          ) {
            job { id done }
            orderCancelUserErrors { field message code }
            userErrors { field message }
          }
        }`,
        {
          orderId: orderGid,
          notifyCustomer: false,
          refundMethod: { originalPaymentMethodsRefund: true },
          // Linker/WMS owns restock; avoid double-restocking Shopify inventory.
          restock: false,
          reason: "CUSTOMER",
          staffNote: `WMS Linker return ${returnDoc.rmaNumber || returnDoc._id}`,
        }
      );

      const errs = [
        ...(result.orderCancel?.orderCancelUserErrors || []),
        ...(result.orderCancel?.userErrors || []),
      ];
      if (errs.length) {
        const message = errs.map((e) => e.message).join("; ");
        meta.shopifyReturnError = message;
        returnDoc.metadata = meta;
        await returnDoc.save();
        return { ok: false, action: "orderCancel", error: message };
      }

      meta.shopifyCancelled = true;
      meta.shopifyCancelJobId = result.orderCancel?.job?.id || "";
      meta.shopifyReturnError = "";
      returnDoc.metadata = meta;
      await returnDoc.save();

      logs
        .logOrderTransition({
          orderId: order._id,
          companyId: returnDoc.companyId,
          fromState: order.status,
          toState: "shopify_cancelled",
          message: `Shopify order cancelled for return ${returnDoc.rmaNumber}`,
          meta: { returnId: String(returnDoc._id), jobId: meta.shopifyCancelJobId },
        })
        .catch(() => {});

      return { ok: true, action: "orderCancel", jobId: meta.shopifyCancelJobId };
    }

    const fulfillmentLines = await loadFulfillmentLineItems(shop, orderGid);
    const { items, unmatched } = buildReturnLineItems(fulfillmentLines, returnDoc.lines || []);
    if (!items.length) {
      const message = "No matching Shopify fulfillment line items for return";
      meta.shopifyReturnError = message;
      returnDoc.metadata = meta;
      await returnDoc.save();
      return { ok: false, action: "returnCreate", error: message, unmatched };
    }

    const result = await shops.shopifyGraphql(
      shop,
      `mutation returnCreate($returnInput: ReturnInput!) {
        returnCreate(returnInput: $returnInput) {
          return { id status }
          userErrors { field message code }
        }
      }`,
      {
        returnInput: {
          orderId: orderGid,
          returnLineItems: items,
          notifyCustomer: false,
        },
      }
    );

    const errs = result.returnCreate?.userErrors || [];
    if (errs.length) {
      const message = errs.map((e) => e.message).join("; ");
      meta.shopifyReturnError = message;
      returnDoc.metadata = meta;
      await returnDoc.save();
      return { ok: false, action: "returnCreate", error: message, unmatched };
    }

    meta.shopifyReturnId = result.returnCreate?.return?.id || "";
    meta.shopifyReturnError = "";
    if (unmatched.length) meta.shopifyReturnUnmatched = unmatched;
    returnDoc.metadata = meta;
    await returnDoc.save();

    logs
      .logOrderTransition({
        orderId: order._id,
        companyId: returnDoc.companyId,
        fromState: order.status,
        toState: "shopify_return_opened",
        message: `Shopify return opened for ${returnDoc.rmaNumber}`,
        meta: { returnId: String(returnDoc._id), shopifyReturnId: meta.shopifyReturnId },
      })
      .catch(() => {});

    return { ok: true, action: "returnCreate", shopifyReturnId: meta.shopifyReturnId, unmatched };
  } catch (error) {
    const message = error.message || String(error);
    logger.warn({ err: error, orderId: String(order._id), returnId: String(returnDoc._id) }, "Shopify return sync failed");
    meta.shopifyReturnError = message;
    returnDoc.metadata = meta;
    try {
      await returnDoc.save();
    } catch {
      /* ignore */
    }
    return { ok: false, error: message };
  }
}

async function syncReturnCompleted({ shop, order, returnDoc }) {
  if (!shop || !shops.isProcessable(shop) || order?.source === "demo") {
    return { skipped: true, reason: "demo_or_shop_not_processable" };
  }

  const meta = { ...(returnDoc.metadata || {}) };
  const shopifyReturnId = meta.shopifyReturnId;
  if (!shopifyReturnId) {
    return { skipped: true, reason: "no_shopify_return" };
  }

  try {
    const result = await shops.shopifyGraphql(
      shop,
      `mutation returnClose($id: ID!) {
        returnClose(id: $id) {
          return { id status }
          userErrors { field message }
        }
      }`,
      { id: shopifyReturnId }
    );
    const errs = result.returnClose?.userErrors || [];
    if (errs.length) {
      const message = errs.map((e) => e.message).join("; ");
      meta.shopifyReturnError = message;
      returnDoc.metadata = meta;
      await returnDoc.save();
      return { ok: false, action: "returnClose", error: message };
    }
    meta.shopifyReturnClosed = true;
    meta.shopifyReturnError = "";
    returnDoc.metadata = meta;
    await returnDoc.save();
    return { ok: true, action: "returnClose" };
  } catch (error) {
    const message = error.message || String(error);
    logger.warn({ err: error, returnId: String(returnDoc._id) }, "Shopify returnClose failed");
    meta.shopifyReturnError = message;
    returnDoc.metadata = meta;
    try {
      await returnDoc.save();
    } catch {
      /* ignore */
    }
    return { ok: false, error: message };
  }
}

async function syncReturnCancelled({ shop, order, returnDoc }) {
  if (!shop || !shops.isProcessable(shop) || order?.source === "demo") {
    return { skipped: true, reason: "demo_or_shop_not_processable" };
  }

  const meta = { ...(returnDoc.metadata || {}) };
  const shopifyReturnId = meta.shopifyReturnId;
  if (!shopifyReturnId) {
    return { skipped: true, reason: "no_shopify_return" };
  }

  try {
    const result = await shops.shopifyGraphql(
      shop,
      `mutation returnCancel($id: ID!) {
        returnCancel(id: $id) {
          return { id status }
          userErrors { field message }
        }
      }`,
      { id: shopifyReturnId }
    );
    const errs = result.returnCancel?.userErrors || [];
    if (errs.length) {
      const message = errs.map((e) => e.message).join("; ");
      meta.shopifyReturnError = message;
      returnDoc.metadata = meta;
      await returnDoc.save();
      return { ok: false, action: "returnCancel", error: message };
    }
    meta.shopifyReturnCancelled = true;
    meta.shopifyReturnError = "";
    returnDoc.metadata = meta;
    await returnDoc.save();
    return { ok: true, action: "returnCancel" };
  } catch (error) {
    const message = error.message || String(error);
    logger.warn({ err: error, returnId: String(returnDoc._id) }, "Shopify returnCancel failed");
    meta.shopifyReturnError = message;
    returnDoc.metadata = meta;
    try {
      await returnDoc.save();
    } catch {
      /* ignore */
    }
    return { ok: false, error: message };
  }
}

module.exports = {
  syncReturnOpened,
  syncReturnCompleted,
  syncReturnCancelled,
};
