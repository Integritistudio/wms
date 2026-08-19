const { randomUUID } = require("crypto");
const Order = require("./model");
const shops = require("../shops");
const edi = require("../edi");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");
const logs = require("../logs");
const saga = require("../saga");

function snapshotFromShopify(payload) {
  const shipping = payload.shipping_address || {};
  const shippingLine = (payload.shipping_lines || [])[0] || {};
  const risk = (payload.risk_assessments || payload.risks || [])[0] || {};
  const riskRecommendation = (risk.recommendation || risk.level || "").toUpperCase();
  const riskLevel = ["LOW", "MEDIUM", "HIGH"].includes(riskRecommendation) ? riskRecommendation : "NONE";

  return {
    shopifyOrderId: String(payload.id),
    orderNumber: String(payload.order_number || payload.name || payload.id).replace(/^#/, ""),
    customerName: [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") || payload.email || "",
    email: payload.email || "",
    shippingAddress: {
      name: shipping.name || [shipping.first_name, shipping.last_name].filter(Boolean).join(" "),
      address1: shipping.address1 || "",
      address2: shipping.address2 || "",
      city: shipping.city || "",
      provinceCode: shipping.province_code || "",
      zip: shipping.zip || "",
      countryCode: shipping.country_code || "",
      phone: shipping.phone || "",
    },
    lineItems: (payload.line_items || []).map((item) => ({
      id: String(item.id),
      sku: item.sku || "",
      title: item.title || "",
      quantity: item.quantity || 1,
      variantId: item.variant_id ? String(item.variant_id) : "",
      fulfillmentOrderLineItemGid: item.admin_graphql_api_id || "",
      wmsUom: "EA",
    })),
    isB2B: !!(payload.company || payload.po_number),
    poNumber: payload.po_number || payload.note_attributes?.find((a) => a.name === "po_number")?.value || "",
    riskLevel,
    giftMessage: payload.note || "",
    shippingMethod: {
      shopifyServiceCode: shippingLine.code || "",
      carrierScac: shippingLine.carrier_identifier || null,
      requestedShipDate: null,
      isExpedited: /express|overnight|expedit/i.test(shippingLine.title || ""),
      wmsShipCode: shippingLine.code || "",
    },
    payload,
  };
}

function toCanonical(order, shop, { replayOf } = {}) {
  const messageId = randomUUID();
  if (!order.messageId) order.messageId = messageId;
  if (!order.canonicalIdempotencyKey) order.canonicalIdempotencyKey = randomUUID();

  return {
    envelope: {
      messageId,
      correlationId: String(order.shopifyOrderId),
      schemaVersion: "1.0.0",
      emittedAt: new Date().toISOString(),
      idempotencyKey: order.canonicalIdempotencyKey,
      replayOf: replayOf || null,
    },
    order: {
      shopifyOrderGid: `gid://shopify/Order/${order.shopifyOrderId}`,
      fulfillmentOrderGid: null,
      orderName: order.orderNumber,
      placedAt: order.createdAt,
      isB2B: order.isB2B || false,
      poNumber: order.poNumber || null,
      riskLevel: order.riskLevel || "NONE",
      giftMessage: order.giftMessage || null,
    },
    allocation: {
      shopifyLocationGid: null,
      wmsLocationCode: order.warehouseId ? String(order.warehouseId) : "UNASSIGNED",
      allocationReason: order.warehouseId ? "USER_ASSIGNED" : "UNASSIGNED",
    },
    shipTo: {
      ...(order.shippingAddress || {}),
      isResidential: true,
      avsStatus: null,
    },
    shipping: order.shippingMethod || {
      shopifyServiceCode: "",
      wmsShipCode: "",
      carrierScac: null,
      requestedShipDate: null,
      isExpedited: false,
    },
    lines: (order.lineItems || []).map((item) => ({
      shopifySku: item.sku,
      wmsSku: item.sku,
      quantity: item.quantity,
      title: item.title,
      fulfillmentOrderLineItemGid: item.fulfillmentOrderLineItemGid || null,
      wmsUom: item.wmsUom || "EA",
    })),
  };
}

async function ingestFromWebhook(shop, payload, options = {}) {
  if (!options.skipProcessable && !shops.isProcessable(shop)) {
    logger.debug({ shop: shop?.shopDomain, orderId: payload?.id }, "Ignoring order for non-processable shop");
    return { ignored: true };
  }

  const snapshot = snapshotFromShopify(payload);
  const order = await Order.findOneAndUpdate(
    { shopId: shop._id, shopifyOrderId: snapshot.shopifyOrderId },
    {
      $setOnInsert: {
        shopId: shop._id,
        ...snapshot,
        source: options.source || "shopify",
        status: "received",
        messageId: randomUUID(),
        canonicalIdempotencyKey: randomUUID(),
      },
    },
    { upsert: true, new: true }
  );

  if (["940_ready", "945_received", "fulfilled", "cancelled"].includes(order.status)) {
    return { ignored: false, order: order.toPublic(), duplicate: true };
  }

  await saga.create({ orderId: order._id, shopId: shop._id }).catch(() => {});

  try {
    await saga.startStep(order._id, "generate_940");
    const { link } = await edi.create940({ order, shop });
    order.canonical = toCanonical(order, shop);
    order.status = "940_ready";
    order.fileLink = link;
    order.lastError = "";
    order.sftpStatus = "skipped";
    order.sftpError = "";
    await order.save();
    await saga.advance(order._id, "940_GENERATED", "generate_940").catch(() => {});
    logs.logOrderTransition({ orderId: order._id, companyId: shop.companyId, fromState: "received", toState: "940_ready" }).catch(() => {});
  } catch (error) {
    order.status = "error";
    order.lastError = error.message;
    await order.save();
    await saga.failStep(order._id, "generate_940", error.message).catch(() => {});
    logs.logOrderTransition({ orderId: order._id, companyId: shop.companyId, fromState: "received", toState: "error", message: error.message }).catch(() => {});
    throw error;
  }

  return { ignored: false, order: order.toPublic() };
}

async function simulate(shopId, payload = {}) {
  const shop = await shops.getById(shopId);
  const stamp = Date.now().toString();
  const fake = {
    id: `demo-${stamp}`,
    order_number: payload.orderNumber || `DEMO-${stamp.slice(-6)}`,
    email: payload.email || "",
    shipping_address: {
      first_name: payload.customerName || "Demo",
      last_name: "Customer",
      name: payload.customerName || "Demo Customer",
      address1: payload.address1 || "123 Warehouse Ave",
      city: payload.city || "Austin",
      province_code: payload.provinceCode || "TX",
      zip: payload.zip || "78701",
      country_code: payload.countryCode || "US",
      phone: payload.phone || "",
    },
    line_items: [
      {
        id: `demo-${stamp}-1`,
        sku: payload.sku || "DEMO-SKU",
        title: payload.title || "Demo item",
        quantity: Number(payload.quantity || 1),
        variant_id: "",
      },
    ],
  };

  return ingestFromWebhook(shop, fake, { source: "demo", skipProcessable: true });
}

async function listByShop(shopId) {
  const orders = await Order.find({ shopId }).sort({ createdAt: -1 }).limit(200);
  return orders.map((order) => order.toPublic());
}

async function listForShops(shopIds) {
  if (!shopIds?.length) {
    return [];
  }

  const orders = await Order.find({ shopId: { $in: shopIds } }).sort({ createdAt: -1 }).limit(200);
  return orders.map((order) => order.toPublic());
}

async function listAssignedToWarehouses(shopIds, warehouseIds) {
  if (!shopIds?.length || !warehouseIds?.length) {
    return [];
  }

  const orders = await Order.find({
    shopId: { $in: shopIds },
    warehouseId: { $in: warehouseIds },
  })
    .sort({ createdAt: -1 })
    .limit(200);
  return orders.map((order) => order.toPublic());
}

async function getById(id) {
  const order = await Order.findById(id);
  if (!order) {
    throw httpError(404, "Order not found");
  }
  return order;
}

async function cancelByShopifyId(shop, shopifyOrderId) {
  const order = await Order.findOne({ shopId: shop._id, shopifyOrderId: String(shopifyOrderId) });
  if (!order) {
    return { ignored: true };
  }
  if (order.status === "fulfilled") {
    return { ignored: false, order: order.toPublic(), duplicate: true };
  }
  order.status = "cancelled";
  await order.save();
  return { ignored: false, order: order.toPublic() };
}

function shouldFulfillShopify(shop, order) {
  return order.source !== "demo" && shops.isProcessable(shop);
}

async function apply945({ order, shop, body, fileName, fulfill, trackingNumber, carrier }) {
  if (order.status === "cancelled") {
    throw httpError(400, "Order is cancelled");
  }

  let ediBody = body;
  if (!ediBody) {
    if (!trackingNumber) {
      throw httpError(400, "Tracking number is required");
    }
    ediBody = edi.sample945({
      order,
      shop,
      trackingNumber,
      carrier: carrier || "UPS",
    });
    fileName = fileName || `945-${order.orderNumber}.edi`;
  }

  const result = await edi.ingest945({ order, shop, body: ediBody, fileName });
  order.status = "945_received";
  order.trackingNumber = result.parsed.trackingNumber || trackingNumber || result.parsed.shipmentId;
  order.carrier = result.parsed.carrier || carrier || "";
  await order.save();
  await saga.advance(order._id, "945_RECEIVED", "receive_945").catch(() => {});

  const notifications = require("../notifications");
  notifications.create({
    companyId: shop.companyId,
    type: "945_received",
    title: `945 received for order ${order.orderNumber}`,
    message: `Tracking: ${order.trackingNumber || "N/A"}, Carrier: ${order.carrier || "N/A"}`,
    meta: { orderId: order._id.toString(), orderNumber: order.orderNumber },
  }).catch(() => {});

  const canFulfill = typeof fulfill === "function" && shouldFulfillShopify(shop, order);
  if (canFulfill) {
    try {
      await saga.startStep(order._id, "create_fulfillment");
      await fulfill({ shop, order });
      order.status = "fulfilled";
      order.lastError = "";
      await order.save();
      await saga.advance(order._id, "FULFILLED", "create_fulfillment").catch(() => {});
    } catch (error) {
      order.lastError = error.message;
      await order.save();
      await saga.failStep(order._id, "create_fulfillment", error.message).catch(() => {});
    }
  } else {
    order.status = "fulfilled";
    order.lastError = shouldFulfillShopify(shop, order) ? order.lastError : "";
    await order.save();
    await saga.advance(order._id, "FULFILLED", "auto_fulfill").catch(() => {});
  }

  return order.toPublic();
}

async function sample945(orderId, trackingNumber, carrier) {
  const order = await getById(orderId);
  const shop = await shops.getById(order.shopId);
  const body = edi.sample945({
    order,
    shop,
    trackingNumber: trackingNumber || `1Z${Date.now().toString().slice(-12)}`,
    carrier: carrier || "UPS",
  });
  return {
    fileName: `945-${order.orderNumber || order.shopifyOrderId}.edi`,
    body,
    order: order.toPublic(),
  };
}

async function protectLink(orderId, password) {
  const order = await getById(orderId);
  const shop = await shops.getById(order.shopId);
  const { link } = await edi.create940({ order, shop, password });
  order.fileLink = link;
  await order.save();
  return order.toPublic();
}

async function assignWarehouse(orderId, warehouseId) {
  const order = await getById(orderId);
  const shop = await shops.getById(order.shopId);
  const Warehouse = require("../companies/warehouseModel");
  const SftpConnection = require("../companies/sftpConnectionModel");
  const sftp = require("../companies/sftp");

  if (!warehouseId) {
    order.warehouseId = null;
    order.sftpStatus = "skipped";
    order.sftpError = "";
    order.canonical = toCanonical(order, shop);
    await order.save();
    return order.toPublic();
  }

  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse || String(warehouse.companyId) !== String(shop.companyId)) {
    throw httpError(400, "Warehouse does not belong to this company");
  }

  order.warehouseId = warehouse._id;
  order.canonical = toCanonical(order, shop);
  await saga.advance(order._id, "ALLOCATED", "allocate_warehouse").catch(() => {});

  let file = await edi.getLatest940(order._id);
  if (!file) {
    file = await edi.create940({ order, shop, warehouseId: warehouse._id });
    order.fileLink = file.link;
    order.status = order.status === "received" || order.status === "error" ? "940_ready" : order.status;
  }

  if (warehouse.sftpConnectionId) {
    await saga.startStep(order._id, "deliver_sftp");
    const connection = await SftpConnection.findById(warehouse.sftpConnectionId);
    const start = Date.now();
    const delivered = await sftp.deliverWithConnection(connection, {
      body: file.body,
      fileName: file.fileName,
    });
    order.sftpStatus = delivered.status;
    order.sftpError = delivered.error || "";
    logs.logSftpDelivery({ orderId: order._id, warehouseId: warehouse._id, companyId: shop.companyId, filename: file.fileName, status: delivered.status, duration: Date.now() - start, bytes: file.body.length, error: delivered.error }).catch(() => {});
    if (delivered.status === "failed") {
      await saga.failStep(order._id, "deliver_sftp", delivered.error || "SFTP delivery failed").catch(() => {});
      const dlq = require("./failedOrderService");
      dlq.create({ orderId: order._id, shopId: order.shopId, companyId: shop.companyId, reason: "SFTP_ERROR", errorMessage: delivered.error || "" }).catch(() => {});
      const notifications = require("../notifications");
      notifications.create({ companyId: shop.companyId, type: "sftp_failed", title: `SFTP delivery failed for order ${order.orderNumber}`, message: delivered.error || "SFTP upload failed", meta: { orderId: order._id.toString() } }).catch(() => {});
    } else {
      await saga.advance(order._id, "SENT_TO_3PL", "deliver_sftp").catch(() => {});
    }
  } else {
    order.sftpStatus = "skipped";
    order.sftpError = "";
  }

  await order.save();
  return order.toPublic();
}

module.exports = {
  ingestFromWebhook,
  simulate,
  listByShop,
  listForShops,
  listAssignedToWarehouses,
  getById,
  cancelByShopifyId,
  apply945,
  sample945,
  protectLink,
  assignWarehouse,
};
