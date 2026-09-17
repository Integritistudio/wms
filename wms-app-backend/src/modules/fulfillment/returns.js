const Return = require("./returnModel");
const FulfillmentGroup = require("./groupModel");
const Shipment = require("./shipmentModel");
const inventory = require("./inventory");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");

const TERMINAL = new Set([
  "restocked",
  "refurbished",
  "damaged",
  "quarantined",
  "disposed",
  "scrapped",
  "refunded",
  "exchanged",
  "cancelled",
]);

const TRANSITIONS = {
  requested: ["authorized", "cancelled"],
  authorized: ["in_transit", "received", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: ["inspected", "restocked", "refurbished", "damaged", "quarantined", "disposed", "scrapped", "cancelled"],
  inspected: ["restocked", "refurbished", "damaged", "quarantined", "disposed", "scrapped", "refunded", "exchanged", "cancelled"],
  restocked: ["refunded", "exchanged"],
  refurbished: ["refunded", "exchanged"],
  damaged: ["refunded"],
  quarantined: ["refunded", "restocked", "disposed", "scrapped"],
  disposed: ["refunded"],
  scrapped: ["refunded"],
  refunded: [],
  exchanged: [],
  cancelled: [],
};

/** Map disposition choice → return status label expected by ops. */
function statusFromDisposition(disposition) {
  switch (String(disposition || "").trim()) {
    case "refurbish":
      return "refurbished";
    case "damaged":
      return "damaged";
    case "quarantine":
      return "quarantined";
    case "dispose":
      return "disposed";
    case "restock":
    default:
      return "restocked";
  }
}

function noteForDisposition(disposition, fallback = "") {
  if (fallback) return fallback;
  switch (String(disposition || "").trim()) {
    case "refurbish":
      return "Marked refurbished";
    case "damaged":
      return "Marked damaged";
    case "quarantine":
      return "Marked quarantined";
    case "dispose":
      return "Marked disposed";
    case "restock":
      return "Inventory restocked";
    default:
      return "Disposition applied";
  }
}

function pushHistory(doc, status, note = "") {
  doc.statusHistory = doc.statusHistory || [];
  doc.statusHistory.push({ status, note, at: new Date() });
}

function nextRmaNumber(orderNumber) {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const base = String(orderNumber || "ORD").replace(/[^A-Za-z0-9]/g, "").slice(-8) || "ORD";
  return `RMA-${base}-${stamp}`;
}

function normalizeLines(rawLines = []) {
  return (rawLines || [])
    .map((line) => ({
      orderLineId: String(line.orderLineId || line.id || ""),
      sku: String(line.sku || "").trim(),
      title: String(line.title || ""),
      quantity: Math.max(0, Number(line.quantity) || 0),
      receivedQty: Math.max(0, Number(line.receivedQty) || 0),
      restockedQty: Math.max(0, Number(line.restockedQty) || 0),
      disposition: line.disposition || "",
    }))
    .filter((l) => l.quantity > 0);
}

function lineKey(line) {
  const sku = String(line.sku || "").trim().toUpperCase();
  const id = String(line.orderLineId || line.id || "").trim();
  return `${id}|${sku}`;
}

function returnableQty(orderLine) {
  const shipped = Number(orderLine.shippedQty);
  if (Number.isFinite(shipped) && shipped > 0) return shipped;
  return Math.max(0, Number(orderLine.quantity) || 0);
}

/**
 * Recompute order.status from active RMAs:
 * - no active returns → restore fulfilled / partially_fulfilled when leaving return states
 * - some lines returned → partially_returned
 * - all returnable qty covered → returned
 */
async function recomputeOrderReturnStatus(orderId, { note } = {}) {
  const Order = require("../orders/model");
  const order = await Order.findById(orderId);
  if (!order) return null;

  const activeReturns = await Return.find({
    orderId: order._id,
    isDeleted: { $ne: true },
    status: { $ne: "cancelled" },
  }).lean();

  const returnedByKey = new Map();
  for (const rma of activeReturns) {
    for (const line of rma.lines || []) {
      const key = lineKey(line);
      const qty = Math.max(0, Number(line.quantity) || 0);
      if (!qty) continue;
      returnedByKey.set(key, (returnedByKey.get(key) || 0) + qty);
    }
  }

  let totalReturnable = 0;
  let totalReturned = 0;
  for (const line of order.lineItems || []) {
    const returnable = returnableQty(line);
    if (returnable <= 0) continue;
    totalReturnable += returnable;
    const key = lineKey({ orderLineId: line.id, sku: line.sku });
    const returned = Math.min(returnable, returnedByKey.get(key) || 0);
    // Also match by SKU-only when orderLineId missing on RMA lines
    let skuOnly = 0;
    if (!returned) {
      const sku = String(line.sku || "").trim().toUpperCase();
      if (sku) {
        for (const [k, v] of returnedByKey.entries()) {
          if (k.endsWith(`|${sku}`)) skuOnly += v;
        }
      }
    }
    totalReturned += returned || Math.min(returnable, skuOnly);
  }

  const prev = order.status;
  let next = prev;

  if (!activeReturns.length) {
    if (prev === "returned" || prev === "partially_returned") {
      const lines = order.lineItems || [];
      const allShipped =
        lines.length > 0 &&
        lines.every((l) => {
          const qty = Math.max(0, Number(l.quantity) || 0);
          if (qty <= 0) return true;
          return (Number(l.shippedQty) || 0) >= qty;
        });
      const someShipped = lines.some((l) => (Number(l.shippedQty) || 0) > 0);
      if (allShipped) next = "fulfilled";
      else if (someShipped) next = "partially_fulfilled";
      else if (prev === "returned" || prev === "partially_returned") next = "fulfilled";
    }
  } else if (totalReturnable > 0 && totalReturned >= totalReturnable) {
    next = "returned";
  } else {
    next = "partially_returned";
  }

  if (next !== prev) {
    order.status = next;
    await order.save();
    const logs = require("../logs");
    logs
      .logOrderTransition({
        orderId: order._id,
        companyId: activeReturns[0]?.companyId,
        shopId: order.shopId,
        fromState: prev,
        toState: next,
        message: note || `Order status set to ${next} from return activity`,
        meta: {
          activeReturnCount: activeReturns.length,
          totalReturned,
          totalReturnable,
        },
      })
      .catch(() => {});
  }

  return { order, previousStatus: prev, status: next, isFullReturn: next === "returned", activeReturnCount: activeReturns.length };
}

async function syncShopifyForReturn(order, returnDoc, { phase, isFullReturn = false }) {
  try {
    const shop = order.shopId ? await require("../shops").getById(order.shopId) : null;
    const shopifyReturns = require("../shopify/returns");
    const freshOrder = await require("../orders/model").findById(order._id);

    if (phase === "open") {
      return shopifyReturns.syncReturnOpened({
        shop,
        order: freshOrder || order,
        returnDoc,
        isFullReturn,
      });
    }
    if (phase === "complete") {
      return shopifyReturns.syncReturnCompleted({ shop, order: freshOrder || order, returnDoc });
    }
    if (phase === "cancel") {
      return shopifyReturns.syncReturnCancelled({ shop, order: freshOrder || order, returnDoc });
    }
  } catch (error) {
    logger.warn({ err: error, returnId: String(returnDoc?._id) }, "Shopify return sync skipped");
  }
  return { skipped: true };
}

async function assertOrderAccess(orderId, companyId) {
  const Order = require("../orders/model");
  const shops = require("../shops");
  const order = await Order.findById(orderId);
  if (!order) throw httpError(404, "Order not found");
  const shop = await shops.getById(order.shopId);
  if (!shop || String(shop.companyId) !== String(companyId)) {
    throw httpError(404, "Order not found");
  }
  return order;
}

async function listReturns(companyId, { status, orderId, q, warehouseId, warehouseIds, limit = 50 } = {}) {
  const filter = { companyId, isDeleted: { $ne: true } };
  if (status) filter.status = status;
  if (orderId) filter.orderId = orderId;
  if (warehouseIds && warehouseIds.length) {
    filter.warehouseId = { $in: warehouseIds };
  } else if (warehouseId) {
    filter.warehouseId = warehouseId;
  }
  if (q && String(q).trim()) {
    const term = String(q).trim();
    filter.$or = [
      { rmaNumber: new RegExp(term, "i") },
      { trackingNumber: new RegExp(term, "i") },
      { reason: new RegExp(term, "i") },
    ];
  }
  const rows = await Return.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Number(limit) || 50));
  return rows.map((r) => r.toPublic());
}

async function getReturn(companyId, returnId, user = null) {
  const doc = await Return.findOne({ _id: returnId, companyId, isDeleted: { $ne: true } });
  if (!doc) throw httpError(404, "Return not found");

  if (user && user.role === "warehouse") {
    const allowed = (user.warehouseIds || []).map(String);
    if (doc.warehouseId && !allowed.includes(String(doc.warehouseId))) {
      throw httpError(403, "Return does not belong to your assigned warehouse");
    }
  }

  const Order = require("../orders/model");
  const order = await Order.findById(doc.orderId);
  return {
    return: doc.toPublic(),
    order: order ? order.toPublic() : null,
    allowedNext: TRANSITIONS[doc.status] || [],
  };
}

async function softDeleteReturn(companyId, returnId) {
  const doc = await Return.findOne({ _id: returnId, companyId });
  if (!doc) throw httpError(404, "Return not found");
  doc.isDeleted = true;
  doc.deletedAt = new Date();
  await doc.save();
  await recomputeOrderReturnStatus(doc.orderId, { note: `Return ${doc.rmaNumber} removed` });
  return { ok: true, message: "Return soft deleted" };
}

/**
 * Create an RMA from shipped / fulfilled order lines.
 */
async function createReturn(companyId, payload = {}) {
  const order = await assertOrderAccess(payload.orderId, companyId);

  let lines = normalizeLines(payload.lines);
  if (!lines.length) {
    // Default: returnable qty from shipped groups (or order line shippedQty)
    const groups = await FulfillmentGroup.find({
      orderId: order._id,
      status: "shipped",
    }).lean();
    if (groups.length) {
      const bySku = new Map();
      for (const g of groups) {
        for (const line of g.lines || []) {
          const key = `${line.orderLineId || ""}|${(line.sku || "").toUpperCase()}`;
          const qty = Number(line.allocatedQty || line.quantity) || 0;
          const prev = bySku.get(key) || {
            orderLineId: line.orderLineId || "",
            sku: line.sku || "",
            title: line.title || "",
            quantity: 0,
          };
          prev.quantity += qty;
          bySku.set(key, prev);
        }
      }
      lines = normalizeLines([...bySku.values()]);
    } else {
      lines = normalizeLines(
        (order.lineItems || []).map((li) => ({
          orderLineId: String(li.id || ""),
          sku: li.sku,
          title: li.title,
          quantity: Number(li.shippedQty || li.quantity) || 0,
        }))
      );
    }
  }

  if (!lines.length) {
    throw httpError(400, "No returnable lines on this order");
  }

  let warehouseId = payload.warehouseId || order.warehouseId || null;
  if (payload.shipmentId) {
    const shipment = await Shipment.findOne({ _id: payload.shipmentId, companyId });
    if (shipment?.warehouseId) warehouseId = shipment.warehouseId;
  }
  if (!warehouseId) {
    const group = await FulfillmentGroup.findOne({ orderId: order._id, warehouseId: { $ne: null } }).sort({
      createdAt: -1,
    });
    if (group?.warehouseId) warehouseId = group.warehouseId;
  }

  const status = payload.authorize ? "authorized" : "requested";
  const rmaNumber = payload.rmaNumber || nextRmaNumber(order.orderNumber);

  const doc = await Return.create({
    orderId: order._id,
    companyId,
    shopId: order.shopId || null,
    shipmentId: payload.shipmentId || null,
    warehouseId,
    status,
    lines,
    disposition: payload.disposition || "",
    reason: payload.reason || "",
    rmaNumber,
    trackingNumber: payload.trackingNumber || "",
    carrier: payload.carrier || "",
    source: payload.source || "manual",
    statusHistory: [
      { status: "requested", note: payload.reason || "Return requested", at: new Date() },
      ...(status === "authorized"
        ? [{ status: "authorized", note: "Auto-authorized on create", at: new Date() }]
        : []),
    ],
    metadata: payload.metadata || {},
  });

  const logs = require("../logs");
  logs
    .logOrderTransition({
      orderId: order._id,
      companyId,
      fromState: order.status,
      toState: "return_requested",
      message: `Return ${rmaNumber} created (${status})`,
      meta: { returnId: doc._id.toString(), rmaNumber },
    })
    .catch(() => {});

  const notifications = require("../notifications");
  notifications
    .create({
      companyId,
      type: "order_error",
      title: `Return ${rmaNumber} · Order ${order.orderNumber}`,
      message: payload.reason || `Return ${status}`,
      meta: { orderId: order._id.toString(), returnId: doc._id.toString() },
    })
    .catch(() => {});

  const coverage = await recomputeOrderReturnStatus(order._id, {
    note: `Return ${rmaNumber} created`,
  });
  await syncShopifyForReturn(coverage?.order || order, doc, {
    phase: "open",
    isFullReturn: coverage?.isFullReturn === true,
  });

  return doc.toPublic();
}

/**
 * When a shipment is marked returned/failed RTS, open an RMA if one does not exist for that shipment.
 */
async function createFromShipmentReturn(shipment, order, { note } = {}) {
  const existing = await Return.findOne({
    companyId: shipment.companyId,
    shipmentId: shipment._id,
    status: { $nin: ["cancelled"] },
  });
  if (existing) return existing.toPublic();

  const group = shipment.fulfillmentGroupId
    ? await FulfillmentGroup.findById(shipment.fulfillmentGroupId)
    : null;
  const lines = normalizeLines(
    (group?.lines || []).map((line) => ({
      orderLineId: line.orderLineId,
      sku: line.sku,
      title: line.title,
      quantity: line.allocatedQty || line.quantity,
    }))
  );

  return createReturn(shipment.companyId, {
    orderId: order._id,
    shipmentId: shipment._id,
    warehouseId: shipment.warehouseId || group?.warehouseId,
    lines,
    reason: note || "Shipment returned to sender",
    trackingNumber: shipment.trackingNumber || "",
    carrier: shipment.carrier || "",
    source: "shipment_rts",
    authorize: true,
  });
}

async function transitionReturn(companyId, returnId, { status, note, ...extra } = {}) {
  const doc = await Return.findOne({ _id: returnId, companyId });
  if (!doc) throw httpError(404, "Return not found");

  let next = String(status || "").trim();
  const allowed = TRANSITIONS[doc.status] || [];
  if (!allowed.includes(next)) {
    throw httpError(400, `Cannot move return from ${doc.status} to ${next}`);
  }

  if (extra.warehouseId) doc.warehouseId = extra.warehouseId;
  if (extra.trackingNumber !== undefined) doc.trackingNumber = String(extra.trackingNumber || "");
  if (extra.carrier !== undefined) doc.carrier = String(extra.carrier || "");
  if (extra.disposition !== undefined) doc.disposition = extra.disposition || "";
  if (extra.reason !== undefined) doc.reason = String(extra.reason || "");
  if (extra.lines) {
    const patchByKey = new Map(
      normalizeLines(extra.lines).map((l) => [`${l.orderLineId}|${l.sku.toUpperCase()}`, l])
    );
    doc.lines = (doc.lines || []).map((line) => {
      const key = `${line.orderLineId || ""}|${(line.sku || "").toUpperCase()}`;
      const patch = patchByKey.get(key);
      if (!patch) return line;
      if (patch.receivedQty != null) line.receivedQty = patch.receivedQty;
      if (patch.disposition) line.disposition = patch.disposition;
      if (patch.quantity > 0) line.quantity = patch.quantity;
      return line;
    });
  }

  if (next === "received") {
    doc.receivedAt = new Date();
    for (const line of doc.lines || []) {
      if (!line.receivedQty) line.receivedQty = line.quantity;
    }
  }

  if (next === "inspected" && !doc.disposition && extra.disposition) {
    doc.disposition = extra.disposition;
  }

  // Completing via "restocked" follows the selected disposition.
  // Explicit "scrapped" always means dispose → disposed.
  if (next === "restocked") {
    if (extra.disposition) doc.disposition = extra.disposition || doc.disposition;
    if (!doc.disposition) doc.disposition = "restock";
    for (const line of doc.lines || []) {
      if (!line.disposition) line.disposition = doc.disposition;
    }
    next = statusFromDisposition(doc.disposition);
  } else if (next === "scrapped") {
    doc.disposition = "dispose";
    for (const line of doc.lines || []) {
      line.disposition = "dispose";
      if (!line.receivedQty) line.receivedQty = line.quantity;
    }
    next = "disposed";
  }

  if (next === "restocked") {
    await restockReturnLines(doc);
  } else if (["refurbished", "damaged", "quarantined", "disposed"].includes(next)) {
    const dispositionFromStatus = {
      refurbished: "refurbish",
      damaged: "damaged",
      quarantined: "quarantine",
      disposed: "dispose",
    }[next];
    doc.disposition = doc.disposition || dispositionFromStatus;
    for (const line of doc.lines || []) {
      if (!line.disposition) line.disposition = doc.disposition || dispositionFromStatus;
      if (!line.receivedQty) line.receivedQty = line.quantity;
    }
  }

  doc.status = next;
  pushHistory(doc, next, note || "");
  await doc.save();

  const Order = require("../orders/model");
  let order = await Order.findById(doc.orderId);
  if (order) {
    const logs = require("../logs");
    logs
      .logOrderTransition({
        orderId: order._id,
        companyId,
        fromState: "return",
        toState: next,
        message: `Return ${doc.rmaNumber}: ${note || next}`,
        meta: { returnId: doc._id.toString(), status: next },
      })
      .catch(() => {});

    const coverage = await recomputeOrderReturnStatus(order._id, {
      note: `Return ${doc.rmaNumber} → ${next}`,
    });
    order = coverage?.order || (await Order.findById(doc.orderId));

    if (next === "cancelled") {
      await syncShopifyForReturn(order, doc, { phase: "cancel" });
    } else if (["restocked", "refurbished", "damaged", "quarantined", "disposed", "refunded", "exchanged", "scrapped"].includes(next)) {
      await syncShopifyForReturn(order, doc, { phase: "complete" });
    } else if (["authorized", "received"].includes(next) && !doc.metadata?.shopifyReturnId && !doc.metadata?.shopifyCancelled) {
      await syncShopifyForReturn(order, doc, {
        phase: "open",
        isFullReturn: coverage?.isFullReturn === true,
      });
    }
  }

  return {
    return: doc.toPublic(),
    order: order ? order.toPublic() : null,
    allowedNext: TRANSITIONS[doc.status] || [],
  };
}

async function restockReturnLines(doc) {
  if (!doc.warehouseId) {
    throw httpError(400, "Set a warehouse before restocking");
  }
  const disposition = doc.disposition || "restock";

  // Ensure lines are receive-ready before computing restock qty
  for (const line of doc.lines || []) {
    if (!line.disposition) line.disposition = disposition;
    if (!line.receivedQty) line.receivedQty = line.quantity;
  }

  const pending = [];
  for (const line of doc.lines || []) {
    const lineDisp = line.disposition || disposition || "restock";
    // Only true "restock" disposition adjusts on-hand inventory.
    if (lineDisp !== "restock") continue;
    const qty = Math.max(
      0,
      (Number(line.receivedQty) || Number(line.quantity) || 0) - (Number(line.restockedQty) || 0)
    );
    if (!line.sku || qty <= 0) continue;
    pending.push({ line, lineDisp, qty });
  }

  if (!pending.length) {
    throw httpError(
      400,
      "No restockable lines — set disposition to Restock and ensure lines have a SKU and quantity"
    );
  }

  const Warehouse = require("../companies/warehouseModel");
  const warehouse = await Warehouse.findById(doc.warehouseId);
  if (!warehouse) {
    throw httpError(400, "Return warehouse not found");
  }

  // ModernWMS first so a failed putaway does not leave linker stock ahead of WMS
  if (warehouse.fulfillmentMode === "modernwms") {
    const modernwms = require("../modernwms");
    await modernwms.restockInventory({
      warehouse,
      items: pending.map(({ line, qty }) => ({ sku: line.sku, quantity: qty })),
      reference: doc.rmaNumber || String(doc._id),
    });
  }

  for (const { line, lineDisp, qty } of pending) {
    const updated = await inventory.restock({
      companyId: doc.companyId,
      warehouseId: doc.warehouseId,
      sku: line.sku,
      quantity: qty,
    });
    if (!updated) {
      throw httpError(500, `Failed to restock linker inventory for SKU ${line.sku}`);
    }
    line.restockedQty = (Number(line.restockedQty) || 0) + qty;
    line.disposition = lineDisp;
  }

  doc.disposition = doc.disposition || "restock";
  doc.restockedAt = new Date();
  doc.markModified("lines");
}

async function receiveReturn(companyId, returnId, payload = {}) {
  return transitionReturn(companyId, returnId, {
    status: "received",
    note: payload.note || "Received at warehouse",
    warehouseId: payload.warehouseId,
    lines: payload.lines,
  });
}

async function restockReturn(companyId, returnId, payload = {}) {
  const doc = await Return.findOne({ _id: returnId, companyId });
  if (!doc) throw httpError(404, "Return not found");
  if (["refunded", "exchanged", "cancelled", "scrapped", "disposed", "damaged", "refurbished", "quarantined", "restocked"].includes(doc.status)) {
    throw httpError(400, `Cannot apply disposition to a ${doc.status} return`);
  }
  if (["requested"].includes(doc.status)) {
    throw httpError(400, "Authorize and receive the return before applying disposition");
  }

  if (payload.warehouseId) doc.warehouseId = payload.warehouseId;
  if (payload.disposition) doc.disposition = payload.disposition || "restock";
  else if (!doc.disposition) doc.disposition = "restock";

  if (Array.isArray(payload.lines) && payload.lines.length) {
    const patchByKey = new Map(
      normalizeLines(payload.lines).map((l) => [`${l.orderLineId}|${l.sku.toUpperCase()}`, l])
    );
    for (const line of doc.lines || []) {
      const key = `${line.orderLineId || ""}|${(line.sku || "").toUpperCase()}`;
      const patch = patchByKey.get(key);
      if (!patch) continue;
      if (patch.receivedQty != null) line.receivedQty = patch.receivedQty;
      if (patch.disposition) line.disposition = patch.disposition;
    }
  }

  for (const line of doc.lines || []) {
    if (!line.disposition) line.disposition = doc.disposition;
    if (!line.receivedQty) line.receivedQty = line.quantity;
  }
  if (!doc.receivedAt) doc.receivedAt = new Date();

  const targetStatus = statusFromDisposition(doc.disposition);

  if (targetStatus === "restocked") {
    await restockReturnLines(doc);
  }

  if (doc.status !== targetStatus) {
    doc.status = targetStatus;
    pushHistory(doc, targetStatus, noteForDisposition(doc.disposition, payload.note));
  }
  await doc.save();

  const Order = require("../orders/model");
  let order = await Order.findById(doc.orderId);
  if (order) {
    require("../logs")
      .logOrderTransition({
        orderId: order._id,
        companyId,
        fromState: "return",
        toState: targetStatus,
        message: `Return ${doc.rmaNumber} → ${targetStatus}`,
        meta: { returnId: doc._id.toString(), disposition: doc.disposition },
      })
      .catch(() => {});

    const coverage = await recomputeOrderReturnStatus(order._id, {
      note: `Return ${doc.rmaNumber} → ${targetStatus}`,
    });
    order = coverage?.order || (await Order.findById(doc.orderId));
    await syncShopifyForReturn(order, doc, { phase: "complete" });
  }

  return {
    return: doc.toPublic(),
    order: order ? order.toPublic() : null,
    allowedNext: TRANSITIONS[doc.status] || [],
  };
}

module.exports = {
  listReturns,
  getReturn,
  softDeleteReturn,
  createReturn,
  createFromShipmentReturn,
  transitionReturn,
  receiveReturn,
  restockReturn,
  recomputeOrderReturnStatus,
  TRANSITIONS,
};
