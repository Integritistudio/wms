const Order = require("./model");
const shops = require("../shops");
const edi = require("../edi");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");

function snapshotFromShopify(payload) {
  const shipping = payload.shipping_address || {};
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
    })),
    payload,
  };
}

function toCanonical(order, shop) {
  return {
    envelope: {
      correlationId: String(order.shopifyOrderId),
      schemaVersion: "1.0.0",
      emittedAt: new Date().toISOString(),
    },
    order: {
      shopifyOrderGid: order.shopifyOrderId,
      orderName: order.orderNumber,
      placedAt: order.createdAt,
    },
    allocation: {
      shopifyLocationGid: null,
      wmsLocationCode: order.warehouseId ? String(order.warehouseId) : "UNASSIGNED",
      allocationReason: order.warehouseId ? "USER_ASSIGNED" : "UNASSIGNED",
    },
    shipTo: order.shippingAddress,
    lines: (order.lineItems || []).map((item) => ({
      shopifySku: item.sku,
      wmsSku: item.sku,
      quantity: item.quantity,
      title: item.title,
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
      },
    },
    { upsert: true, new: true }
  );

  if (["940_ready", "945_received", "fulfilled", "cancelled"].includes(order.status)) {
    return { ignored: false, order: order.toPublic(), duplicate: true };
  }

  try {
    const { link } = await edi.create940({ order, shop });
    order.canonical = toCanonical(order, shop);
    order.status = "940_ready";
    order.fileLink = link;
    order.lastError = "";
    order.sftpStatus = "skipped";
    order.sftpError = "";
    await order.save();
  } catch (error) {
    order.status = "error";
    order.lastError = error.message;
    await order.save();
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

  const canFulfill = typeof fulfill === "function" && shouldFulfillShopify(shop, order);
  if (canFulfill) {
    try {
      await fulfill({ shop, order });
      order.status = "fulfilled";
      order.lastError = "";
      await order.save();
    } catch (error) {
      order.lastError = error.message;
      await order.save();
    }
  } else {
    order.status = "fulfilled";
    order.lastError = shouldFulfillShopify(shop, order) ? order.lastError : "";
    await order.save();
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

  let file = await edi.getLatest940(order._id);
  if (!file) {
    file = await edi.create940({ order, shop });
    order.fileLink = file.link;
    order.status = order.status === "received" || order.status === "error" ? "940_ready" : order.status;
  }

  if (warehouse.sftpConnectionId) {
    const connection = await SftpConnection.findById(warehouse.sftpConnectionId);
    const delivered = await sftp.deliverWithConnection(connection, {
      body: file.body,
      fileName: file.fileName,
    });
    order.sftpStatus = delivered.status;
    order.sftpError = delivered.error || "";
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
