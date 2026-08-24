const Return = require("./returnModel");
const FulfillmentGroup = require("./groupModel");
const Shipment = require("./shipmentModel");
const inventory = require("./inventory");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");

const TERMINAL = new Set(["restocked", "scrapped", "refunded", "exchanged", "cancelled"]);

const TRANSITIONS = {
  requested: ["authorized", "cancelled"],
  authorized: ["in_transit", "received", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: ["inspected", "restocked", "scrapped", "cancelled"],
  inspected: ["restocked", "scrapped", "refunded", "exchanged", "cancelled"],
  restocked: ["refunded", "exchanged"],
  scrapped: ["refunded"],
  refunded: [],
  exchanged: [],
  cancelled: [],
};

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

async function listReturns(companyId, { status, orderId, q, limit = 50 } = {}) {
  const filter = { companyId };
  if (status) filter.status = status;
  if (orderId) filter.orderId = orderId;
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

async function getReturn(companyId, returnId) {
  const doc = await Return.findOne({ _id: returnId, companyId });
  if (!doc) throw httpError(404, "Return not found");
  const Order = require("../orders/model");
  const order = await Order.findById(doc.orderId);
  return {
    return: doc.toPublic(),
    order: order ? order.toPublic() : null,
    allowedNext: TRANSITIONS[doc.status] || [],
  };
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

  const next = String(status || "").trim();
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

  // Auto-restock when moving to restocked
  if (next === "restocked") {
    await restockReturnLines(doc);
  }

  if (next === "scrapped") {
    doc.disposition = doc.disposition || "dispose";
  }

  doc.status = next;
  pushHistory(doc, next, note || "");
  await doc.save();

  const Order = require("../orders/model");
  const order = await Order.findById(doc.orderId);
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

  let any = false;
  for (const line of doc.lines || []) {
    const lineDisp = line.disposition || disposition || "restock";
    if (lineDisp !== "restock" && lineDisp !== "refurbish") continue;
    const qty = Math.max(0, (Number(line.receivedQty) || Number(line.quantity) || 0) - (Number(line.restockedQty) || 0));
    if (!line.sku || qty <= 0) continue;
    await inventory.restock({
      companyId: doc.companyId,
      warehouseId: doc.warehouseId,
      sku: line.sku,
      quantity: qty,
    });
    line.restockedQty = (Number(line.restockedQty) || 0) + qty;
    line.disposition = lineDisp;
    any = true;
  }

  if (!any) {
    logger.warn({ returnId: String(doc._id) }, "Restock called but no eligible lines");
  }

  doc.disposition = doc.disposition || "restock";
  doc.restockedAt = new Date();
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
  if (["refunded", "exchanged", "cancelled", "scrapped"].includes(doc.status)) {
    throw httpError(400, `Cannot restock a ${doc.status} return`);
  }
  if (["requested"].includes(doc.status)) {
    throw httpError(400, "Authorize and receive the return before restocking");
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

  // Ensure received qty before restock
  for (const line of doc.lines || []) {
    if (!line.receivedQty) line.receivedQty = line.quantity;
  }
  if (!doc.receivedAt) doc.receivedAt = new Date();

  await restockReturnLines(doc);
  if (doc.status !== "restocked") {
    doc.status = "restocked";
    pushHistory(doc, "restocked", payload.note || "Inventory restocked");
  }
  await doc.save();

  const Order = require("../orders/model");
  const order = await Order.findById(doc.orderId);
  if (order) {
    require("../logs")
      .logOrderTransition({
        orderId: order._id,
        companyId,
        fromState: "return",
        toState: "restocked",
        message: `Return ${doc.rmaNumber} restocked`,
        meta: { returnId: doc._id.toString() },
      })
      .catch(() => {});
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
  createReturn,
  createFromShipmentReturn,
  transitionReturn,
  receiveReturn,
  restockReturn,
  TRANSITIONS,
};
