const { randomUUID } = require("crypto");
const Order = require("./model");
const shops = require("../shops");
const edi = require("../edi");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");
const logs = require("../logs");
const saga = require("../saga");
const fulfillment = require("../fulfillment");
const { enrichLineItems } = require("../fulfillment/allocate");

function snapshotFromShopify(payload) {
  const shipping = payload.shipping_address || {};
  const billing = payload.billing_address || {};
  const shippingLine = (payload.shipping_lines || [])[0] || {};
  const risk = (payload.risk_assessments || payload.risks || [])[0] || {};
  const riskRecommendation = (risk.recommendation || risk.level || "").toUpperCase();
  const riskLevel = ["LOW", "MEDIUM", "HIGH"].includes(riskRecommendation) ? riskRecommendation : "NONE";
  const customer = payload.customer || {};

  const formatAddress = (addr = {}) => ({
    name: addr.name || [addr.first_name, addr.last_name].filter(Boolean).join(" "),
    firstName: addr.first_name || "",
    lastName: addr.last_name || "",
    company: addr.company || "",
    address1: addr.address1 || "",
    address2: addr.address2 || "",
    city: addr.city || "",
    province: addr.province || "",
    provinceCode: addr.province_code || "",
    zip: addr.zip || "",
    country: addr.country || "",
    countryCode: addr.country_code || "",
    phone: addr.phone || "",
  });

  const shippingAddress = formatAddress(shipping);
  const billingAddress = formatAddress(billing);
  const customerName =
    shippingAddress.name ||
    billingAddress.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    payload.email ||
    "";

  return {
    shopifyOrderId: String(payload.id),
    orderNumber: String(payload.order_number || payload.name || payload.id).replace(/^#/, ""),
    customerName,
    email: payload.email || customer.email || "",
    phone: shipping.phone || billing.phone || customer.phone || "",
    shippingAddress,
    billingAddress,
    lineItems: (payload.line_items || []).map((item) => ({
      id: String(item.id),
      sku: item.sku || "",
      title: item.title || "",
      variantTitle: item.variant_title || "",
      name: item.name || item.title || "",
      quantity: item.quantity || 1,
      price: item.price != null ? String(item.price) : "",
      totalDiscount: item.total_discount != null ? String(item.total_discount) : "",
      vendor: item.vendor || "",
      requiresShipping: item.requires_shipping !== false,
      fulfillmentStatus: item.fulfillment_status || "",
      variantId: item.variant_id ? String(item.variant_id) : "",
      productId: item.product_id ? String(item.product_id) : "",
      fulfillmentOrderLineItemGid: item.admin_graphql_api_id || "",
      wmsUom: "EA",
      status: "open",
      allocatedQty: 0,
      shippedQty: 0,
      backorderedQty: 0,
      serials: [],
      lot: "",
      expiry: null,
    })),
    isB2B: !!(payload.company || payload.po_number),
    poNumber: payload.po_number || payload.note_attributes?.find((a) => a.name === "po_number")?.value || "",
    riskLevel,
    giftMessage: payload.note || "",
    shippingMethod: {
      title: shippingLine.title || "",
      shopifyServiceCode: shippingLine.code || "",
      carrierScac: shippingLine.carrier_identifier || null,
      price: shippingLine.price != null ? String(shippingLine.price) : "",
      requestedShipDate: null,
      isExpedited: /express|overnight|expedit/i.test(shippingLine.title || ""),
      wmsShipCode: shippingLine.code || "",
    },
    currency: payload.currency || payload.presentment_currency || "",
    totals: {
      subtotal: payload.subtotal_price != null ? String(payload.subtotal_price) : "",
      totalTax: payload.total_tax != null ? String(payload.total_tax) : "",
      totalDiscounts: payload.total_discounts != null ? String(payload.total_discounts) : "",
      totalShipping:
        payload.total_shipping_price_set?.shop_money?.amount != null
          ? String(payload.total_shipping_price_set.shop_money.amount)
          : shippingLine.price != null
            ? String(shippingLine.price)
            : "",
      totalPrice: payload.total_price != null ? String(payload.total_price) : "",
    },
    tags: payload.tags || "",
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
      allocationReason: order.routingReason
        ? "AUTO_ROUTED"
        : order.warehouseId
          ? "USER_ASSIGNED"
          : "UNASSIGNED",
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
    { upsert: true, returnDocument: "after" }
  );

  if (["940_ready", "945_received", "partially_fulfilled", "fulfilled", "cancelled"].includes(order.status)) {
    return { ignored: false, order: order.toPublic(), duplicate: true };
  }

  await saga.create({ orderId: order._id, shopId: shop._id }).catch(() => {});
  order.lineItems = enrichLineItems(order.lineItems);
  order.canonical = toCanonical(order, shop);
  await order.save();

  const notifications = require("../notifications");
  notifications.create({
    companyId: shop.companyId,
    type: "order_received",
    title: `Order ${order.orderNumber} received`,
    message: `${(order.lineItems || []).length} line(s)`,
    meta: { orderId: order._id.toString() },
  }).catch(() => {});

  try {
    const routing = require("../routing");
    const config = await routing.getConfig(shop.companyId);

    if (options.forceWarehouseId) {
      await fulfillment.allocateOrder(order, shop, {
        forceWarehouseId: options.forceWarehouseId,
      });
    } else if (options.forceAllocate) {
      // Demo / explicit allocate: run full allocation path
      await fulfillment.allocateOrder(order, shop, {});
    } else if (config.enabled) {
      const routed = await routing.resolveForOrder(order, shop.companyId);
      const warehouseId = routed?.warehouseId || null;

      if (!warehouseId) {
        await markRoutingNoMatch(
          order,
          shop,
          "No warehouse matched routing rules and no default/fallback is configured"
        );
      } else if (config.autoAssignOnReceive !== false) {
        order.routingRuleId = routed?.ruleId || null;
        order.routingReason = routed?.reason || "";
        order.suggestedWarehouseId = null;
        await order.save();
        await fulfillment.allocateOrder(order, shop, {});
      } else {
        // Suggest only — wait for Accept / manual pick. No 940 / SFTP until committed.
        order.suggestedWarehouseId = warehouseId;
        order.warehouseId = null;
        order.routingRuleId = routed?.ruleId || null;
        order.routingReason = routed?.reason || "Suggested warehouse";
        order.status = "received";
        order.sftpStatus = "skipped";
        order.lastError = "";
        await order.save();
        logger.info(
          { orderId: order._id.toString(), suggestedWarehouseId: String(warehouseId), reason: order.routingReason },
          "Warehouse suggested — awaiting accept"
        );
        const notifications = require("../notifications");
        notifications.create({
          companyId: shop.companyId,
          type: "system",
          title: `Order ${order.orderNumber} needs warehouse confirm`,
          message: order.routingReason || "Accept the suggested warehouse or pick another",
          meta: { orderId: order._id.toString(), suggestedWarehouseId: String(warehouseId) },
        }).catch(() => {});
      }
    } else {
      // Routing off: blank warehouse until human assigns. No orphan 940.
      order.warehouseId = null;
      order.suggestedWarehouseId = null;
      order.routingRuleId = null;
      order.routingReason = "";
      order.status = "received";
      order.sftpStatus = "skipped";
      await order.save();
    }
  } catch (error) {
    order.status = "error";
    order.lastError = error.message;
    await order.save();
    await saga.failStep(order._id, "generate_940", error.message).catch(() => {});
    logs.logOrderTransition({ orderId: order._id, companyId: shop.companyId, fromState: "received", toState: "error", message: error.message }).catch(() => {});
    notifications.create({
      companyId: shop.companyId,
      type: "order_error",
      title: `Order ${order.orderNumber} failed`,
      message: error.message,
      meta: { orderId: order._id.toString() },
    }).catch(() => {});
    throw error;
  }

  const fresh = await getById(order._id);
  return { ignored: false, order: fresh.toPublic() };
}

async function markRoutingNoMatch(order, shop, message) {
  order.status = "error";
  order.lastError = message;
  order.routingReason = message;
  order.warehouseId = null;
  order.suggestedWarehouseId = null;
  await order.save();

  const dlq = require("./failedOrderService");
  await dlq.create({
    orderId: order._id,
    shopId: order.shopId,
    companyId: shop.companyId,
    reason: "ROUTING_NO_MATCH",
    errorMessage: message,
  });

  const notifications = require("../notifications");
  notifications.create({
    companyId: shop.companyId,
    type: "order_error",
    title: `Order ${order.orderNumber} needs warehouse`,
    message,
    meta: { orderId: order._id.toString() },
  }).catch(() => {});

  logs.logOrderTransition({
    orderId: order._id,
    companyId: shop.companyId,
    fromState: "received",
    toState: "error",
    message,
  }).catch(() => {});
}

async function tryAutoRoute(order, shop) {
  const routing = require("../routing");
  const config = await routing.getConfig(shop.companyId);
  if (!config.enabled || config.autoAssignOnReceive === false) {
    return order;
  }

  const result = await routing.resolveForOrder(order, shop.companyId);
  const warehouseId = result?.warehouseId;
  if (!warehouseId) {
    await markRoutingNoMatch(
      order,
      shop,
      "No warehouse matched routing rules and no default/fallback is configured"
    );
    return getById(order._id);
  }

  logger.info(
    { orderId: order._id.toString(), warehouseId: String(warehouseId), reason: result?.reason },
    "Auto-routed order to warehouse"
  );

  await assignWarehouse(order._id, warehouseId, {
    routingRuleId: result?.ruleId,
    routingReason: result?.reason || "Default warehouse",
  });

  return getById(order._id);
}

async function simulate(shopId, payload = {}) {
  const shop = await shops.getById(shopId);
  const stamp = Date.now().toString();
  const customLines = Array.isArray(payload.lineItems)
    ? payload.lineItems
    : Array.isArray(payload.items)
      ? payload.items
      : null;

  const line_items = customLines?.length
    ? customLines.map((item, idx) => ({
        id: item.id || `demo-${stamp}-${idx + 1}`,
        sku: item.sku || `DEMO-SKU-${idx + 1}`,
        title: item.title || item.sku || `Demo item ${idx + 1}`,
        quantity: Number(item.quantity || 1),
        variant_id: item.variantId || "",
      }))
    : [
        {
          id: `demo-${stamp}-1`,
          sku: payload.sku || "DEMO-SKU",
          title: payload.title || "Demo item",
          quantity: Number(payload.quantity || 1),
          variant_id: "",
        },
      ];

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
    line_items,
  };

  // respectRouting: true → honor company routing settings (no forceAllocate).
  // Default stays forceAllocate for backward-compatible demo / lifecycle scripts.
  const respectRouting = payload.respectRouting === true || payload.forceAllocate === false;
  return ingestFromWebhook(shop, fake, {
    source: "demo",
    skipProcessable: true,
    forceAllocate: respectRouting ? false : true,
    forceWarehouseId: payload.forceWarehouseId || null,
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseListQuery(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const status = typeof query.status === "string" && query.status.trim() ? query.status.trim() : "";
  const shopId = query.shopId ? String(query.shopId).trim() : "";
  const warehouseId = query.warehouseId ? String(query.warehouseId).trim() : "";
  return { page, limit, q, status, shopId, warehouseId };
}

function emptyOrderPage(query = {}) {
  const { page, limit } = parseListQuery(query);
  return { items: [], total: 0, page, limit };
}

function idAllowed(constraint, id) {
  if (!constraint) return true;
  if (constraint.$in) {
    return constraint.$in.map(String).includes(String(id));
  }
  return String(constraint) === String(id);
}

/**
 * Shared filtered/paginated order list.
 * @param {object} filter - base Mongo filter (e.g. shop/warehouse scope)
 * @param {object} query - q, status, shopId, warehouseId, page, limit
 * @returns {{ items: object[], total: number, page: number, limit: number }}
 */
async function listOrdersFiltered(filter = {}, query = {}) {
  const { page, limit, q, status, shopId, warehouseId } = parseListQuery(query);
  const mongoFilter = { ...filter };

  if (status === "allocated") {
    // UI "Allocated" = warehouse assigned / 940 ready (and mid-ship before partial/full)
    mongoFilter.status = { $in: ["940_ready", "945_received"] };
  } else if (status === "partial" || status === "partially_fulfilled") {
    mongoFilter.status = "partially_fulfilled";
  } else if (status === "returns" || status === "return") {
    mongoFilter.status = { $in: ["returned", "partially_returned"] };
    // Also include orders that still have an open RMA but status not yet migrated
    const Return = require("../fulfillment/returnModel");
    const shopIds = [];
    if (filter.shopId?.$in) shopIds.push(...filter.shopId.$in);
    else if (filter.shopId) shopIds.push(filter.shopId);
    if (shopId) shopIds.push(shopId);

    const orderMatch = {};
    if (shopIds.length) orderMatch.shopId = { $in: shopIds };
    const scopedOrderIds = (await Order.find(orderMatch).select("_id").lean()).map((o) => o._id);
    const returnOrderIds = await Return.distinct("orderId", {
      orderId: { $in: scopedOrderIds },
      status: { $ne: "cancelled" },
      isDeleted: { $ne: true },
    });
    mongoFilter.$or = [{ status: { $in: ["returned", "partially_returned"] } }, { _id: { $in: returnOrderIds } }];
    delete mongoFilter.status;
  } else if (status) {
    mongoFilter.status = status;
  }

  if (shopId) {
    if (!idAllowed(filter.shopId, shopId)) {
      return emptyOrderPage(query);
    }
    mongoFilter.shopId = shopId;
  }

  if (warehouseId) {
    if (warehouseId === "unassigned" || warehouseId === "none") {
      // Warehouse-scoped users only see assigned warehouses — unassigned is empty for them.
      if (filter.warehouseId) {
        return emptyOrderPage(query);
      }
      const unassignedClause = {
        $or: [{ warehouseId: null }, { warehouseId: { $exists: false } }],
      };
      if (mongoFilter.$or) {
        mongoFilter.$and = [...(mongoFilter.$and || []), { $or: mongoFilter.$or }, unassignedClause];
        delete mongoFilter.$or;
      } else {
        Object.assign(mongoFilter, unassignedClause);
      }
    } else {
      if (!idAllowed(filter.warehouseId, warehouseId)) {
        return emptyOrderPage(query);
      }
      mongoFilter.warehouseId = warehouseId;
    }
  }

  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    const searchClause = {
      $or: [
        { orderNumber: re },
        { shopifyOrderId: re },
        { customerName: re },
        { email: re },
        { "lineItems.sku": re },
      ],
    };
    if (mongoFilter.$or) {
      mongoFilter.$and = [...(mongoFilter.$and || []), { $or: mongoFilter.$or }, searchClause];
      delete mongoFilter.$or;
    } else if (mongoFilter.$and) {
      mongoFilter.$and.push(searchClause);
    } else {
      Object.assign(mongoFilter, searchClause);
    }
  }

  const skip = (page - 1) * limit;
  const [total, orders] = await Promise.all([
    Order.countDocuments(mongoFilter),
    Order.find(mongoFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);

  return {
    items: orders.map((order) => order.toPublic()),
    total,
    page,
    limit,
  };
}

async function listByShop(shopId, query = {}) {
  return listOrdersFiltered({ shopId }, query);
}

async function listForShops(shopIds, query = {}) {
  if (!shopIds?.length) {
    return emptyOrderPage(query);
  }
  return listOrdersFiltered({ shopId: { $in: shopIds } }, query);
}

async function listAssignedToWarehouses(shopIds, warehouseIds, query = {}) {
  if (!shopIds?.length || !warehouseIds?.length) {
    return emptyOrderPage(query);
  }
  return listOrdersFiltered(
    {
      shopId: { $in: shopIds },
      warehouseId: { $in: warehouseIds },
    },
    query
  );
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
  if (["fulfilled", "returned", "partially_returned", "cancelled"].includes(order.status)) {
    return { ignored: false, order: order.toPublic(), duplicate: true };
  }
  await fulfillment.cancelOrderFulfillment(order, shop).catch(() => {});
  order.status = "cancelled";
  await order.save();
  return { ignored: false, order: order.toPublic() };
}

function shouldFulfillShopify(shop, order) {
  return order.source !== "demo" && shops.isProcessable(shop);
}

async function apply945({
  order,
  shop,
  body,
  fileName,
  fulfill,
  trackingNumber,
  carrier,
  fulfillmentGroupId,
  status,
}) {
  if (order.status === "cancelled") {
    throw httpError(400, "Order is cancelled");
  }

  const x12 = require("../edi/x12");
  const fulfillment = require("../fulfillment");
  const FulfillmentGroup = require("../fulfillment/groupModel");
  const Shipment = require("../fulfillment/shipmentModel");

  let parsed = {
    shipmentId: "",
    trackingNumber: trackingNumber || "",
    carrier: carrier || "",
    status: "",
    fulfillmentGroupId: fulfillmentGroupId || "",
    quantities: [],
  };

  if (body) {
    parsed = { ...parsed, ...x12.parseShipment(body) };
  }
  if (status) parsed.status = x12.normalizeShipmentStatus(status) || parsed.status;
  if (trackingNumber) parsed.trackingNumber = trackingNumber;
  if (carrier) parsed.carrier = carrier;
  if (fulfillmentGroupId) parsed.fulfillmentGroupId = fulfillmentGroupId;

  const track = parsed.trackingNumber || parsed.shipmentId || "";
  const nextStatus = x12.normalizeShipmentStatus(parsed.status);

  // Prefer explicit group id from payload / parse
  let group = null;
  const groupId = parsed.fulfillmentGroupId || fulfillmentGroupId;
  if (groupId) {
    group = await FulfillmentGroup.findById(groupId);
    if (group && String(group.orderId) !== String(order._id)) {
      throw httpError(400, "Fulfillment group does not belong to this order");
    }
  }

  // Existing shipment by tracking or group → lifecycle update via 945
  let existingShipment = null;
  if (track) {
    existingShipment = await Shipment.findOne({ orderId: order._id, trackingNumber: track }).sort({ createdAt: -1 });
  }
  if (!existingShipment && group?.shipmentId) {
    existingShipment = await Shipment.findById(group.shipmentId);
  }
  if (!existingShipment && group) {
    existingShipment = await Shipment.findOne({ fulfillmentGroupId: group._id }).sort({ createdAt: -1 });
  }

  if (existingShipment) {
    // Store the 945 update for audit
    if (body) {
      await edi.ingest945({
        order,
        shop,
        body,
        fileName: fileName || `945-update-${order.orderNumber}.edi`,
      }).catch(() => {});
    } else if (track && nextStatus) {
      const updateBody = edi.sample945({
        order,
        trackingNumber: track,
        carrier: parsed.carrier || existingShipment.carrier || "UPS",
        status: nextStatus,
      });
      await edi.ingest945({
        order,
        shop,
        body: updateBody,
        fileName: fileName || `945-${nextStatus}-${order.orderNumber}.edi`,
      }).catch(() => {});
    }

    if (!nextStatus) {
      throw httpError(400, "Shipment already exists — include STATUS in the 945 (in_transit, out_for_delivery, delivered, failed, returned)");
    }

    if (nextStatus === existingShipment.status) {
      return {
        order: order.toPublic(),
        shipment: existingShipment.toPublic(),
        skipped: true,
        reason: `Already ${nextStatus}`,
      };
    }

    const updated = await fulfillment.updateShipmentStatus({
      shipmentId: existingShipment._id,
      companyId: shop.companyId,
      status: nextStatus,
      note: `945 update → ${nextStatus}`,
      source: "edi945",
    });

    return {
      order: updated.order,
      shipment: updated.shipment,
      return: updated.return || null,
      status: nextStatus,
    };
  }

  // First 945 for a group → ship (create labeled shipment)
  if (!group) {
    group = await FulfillmentGroup.findOne({
      orderId: order._id,
      status: { $in: ["allocated", "picking", "picked", "packing", "packed", "pending"] },
    }).sort({ createdAt: 1 });
  }

  if (group) {
    let ediBody = body;
    if (!ediBody) {
      if (!track) throw httpError(400, "Tracking number is required");
      ediBody = edi.sample945({
        order: {
          toEdiPayload: () => ({
            shopifyOrderId: order.shopifyOrderId,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            shippingAddress: order.shippingAddress,
            lineItems: (group.lines || []).map((l) => ({
              id: l.orderLineId,
              sku: l.sku,
              title: l.title,
              quantity: l.allocatedQty || l.quantity,
            })),
          }),
        },
        trackingNumber: track,
        carrier: parsed.carrier || "UPS",
        status: nextStatus || "labeled",
      });
      fileName = fileName || `945-${order.orderNumber}-${group._id}.edi`;
    }

    const result = await fulfillment.shipGroup({
      groupId: group._id,
      trackingNumber: track,
      carrier: parsed.carrier || carrier,
      body: ediBody,
      fileName,
      fulfill,
    });

    // If first 945 already carries a later status, advance after ship
    if (nextStatus && nextStatus !== "labeled" && nextStatus !== "pending" && result.shipment?.id) {
      const advanced = await fulfillment.updateShipmentStatus({
        shipmentId: result.shipment.id,
        companyId: shop.companyId,
        status: nextStatus,
        note: `945 ship with status ${nextStatus}`,
        source: "edi945",
      });
      return {
        order: advanced.order,
        group: result.group,
        shipment: advanced.shipment,
        return: advanced.return || null,
        status: nextStatus,
      };
    }

    return result;
  }

  // Legacy path: no fulfillment groups yet
  let ediBody = body;
  if (!ediBody) {
    if (!track) {
      throw httpError(400, "Tracking number is required");
    }
    ediBody = edi.sample945({
      order,
      shop,
      trackingNumber: track,
      carrier: parsed.carrier || carrier || "UPS",
      status: nextStatus || "labeled",
    });
    fileName = fileName || `945-${order.orderNumber}.edi`;
  }

  const result = await edi.ingest945({ order, shop, body: ediBody, fileName });
  order.status = "945_received";
  order.trackingNumber = result.parsed.trackingNumber || track;
  order.carrier = result.parsed.carrier || carrier || "";

  const inventory = require("../fulfillment/inventory");
  if (order.warehouseId) {
    for (const line of order.lineItems || []) {
      const sku = line.sku || line.variantSku;
      const qty = Number(line.quantity) || 0;
      if (!sku || qty <= 0) continue;
      await inventory.consumeReserved({
        warehouseId: order.warehouseId,
        sku,
        quantity: qty,
      });
      line.shippedQty = qty;
      line.status = "fulfilled";
    }
  }

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
      notifications.create({
        companyId: shop.companyId,
        type: "order_fulfilled",
        title: `Order ${order.orderNumber} fulfilled`,
        message: `Tracking: ${order.trackingNumber || "N/A"}`,
        meta: { orderId: order._id.toString() },
      }).catch(() => {});
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

async function assignWarehouse(orderId, warehouseId, { routingRuleId, routingReason } = {}) {
  const order = await getById(orderId);
  const shop = await shops.getById(order.shopId);
  const Warehouse = require("../companies/warehouseModel");

  if (!warehouseId) {
    const result = await fulfillment.unallocateOrder(order, shop);
    return result.order.toPublic ? result.order.toPublic() : result.order;
  }

  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse || String(warehouse.companyId) !== String(shop.companyId)) {
    throw httpError(400, "Warehouse does not belong to this company");
  }

  order.warehouseId = warehouseId;
  order.routingRuleId = routingRuleId || null;
  order.routingReason = routingReason || "USER_ASSIGNED";
  order.suggestedWarehouseId = null;
  order.lastError = "";
  order.canonical = toCanonical(order, shop);
  await order.save();

  const result = await fulfillment.allocateOrder(order, shop, { forceWarehouseId: warehouseId });
  if (result.failed) {
    throw httpError(400, result.order?.lastError || result.order?.routingReason || "Unable to allocate order to warehouse");
  }
  return result.order.toPublic ? result.order.toPublic() : (await getById(orderId)).toPublic();
}

module.exports = {
  ingestFromWebhook,
  simulate,
  listOrdersFiltered,
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
