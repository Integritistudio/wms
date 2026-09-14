const FulfillmentGroup = require("./groupModel");
const Shipment = require("./shipmentModel");
const allocate = require("./allocate");
const inventory = require("./inventory");
const edi = require("../edi");
const saga = require("../saga");
const logs = require("../logs");
const logger = require("../../config/logger");
const { httpError } = require("../../utils/httpError");

function runAfterResponse(label, fn) {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((err) => logger.error({ err, label }, "Post-allocation task failed"));
  });
}

async function notifyModernwmsPushFailed(error, { group, order, shop }) {
  logger.error({ err: error, groupId: group._id.toString() }, "ModernWMS push failed");
  const dlq = require("../orders/failedOrderService");
  dlq.create({
    orderId: order._id,
    shopId: order.shopId,
    companyId: shop.companyId,
    reason: "MODERNWMS_ERROR",
    errorMessage: error.message || String(error),
  }).catch(() => {});
  const notifications = require("../notifications");
  notifications.create({
    companyId: shop.companyId,
    type: "order_error",
    title: `ModernWMS push failed for order ${order.orderNumber}`,
    message: error.message || "Dispatch push failed",
    meta: { orderId: order._id.toString(), groupId: group._id.toString() },
  }).catch(() => {});
}

async function deliver940(group, order, shop, file, autoDeliverSftp) {
  if (!autoDeliverSftp || !group.warehouseId) {
    group.sftpStatus = "skipped";
    await group.save();
    return group;
  }

  const Warehouse = require("../companies/warehouseModel");
  const SftpConnection = require("../companies/sftpConnectionModel");
  const sftp = require("../companies/sftp");
  const warehouse = await Warehouse.findById(group.warehouseId);
  if (!warehouse?.sftpConnectionId) {
    group.sftpStatus = "skipped";
    await group.save();
    return group;
  }

  const connection = await SftpConnection.findById(warehouse.sftpConnectionId);
  const start = Date.now();
  const delivered = await sftp.deliverWithConnection(connection, {
    body: file.body,
    fileName: file.fileName,
  });
  group.sftpStatus = delivered.status;
  group.sftpError = delivered.error || "";
  await group.save();

  logs.logSftpDelivery({
    orderId: order._id,
    warehouseId: warehouse._id,
    companyId: shop.companyId,
    filename: file.fileName,
    status: delivered.status,
    duration: Date.now() - start,
    bytes: file.body.length,
    error: delivered.error,
  }).catch(() => {});

  if (delivered.status === "failed") {
    const dlq = require("../orders/failedOrderService");
    dlq.create({
      orderId: order._id,
      shopId: order.shopId,
      companyId: shop.companyId,
      reason: "SFTP_ERROR",
      errorMessage: delivered.error || "",
    }).catch(() => {});
    const notifications = require("../notifications");
    notifications.create({
      companyId: shop.companyId,
      type: "sftp_failed",
      title: `SFTP delivery failed for order ${order.orderNumber}`,
      message: delivered.error || "SFTP upload failed",
      meta: { orderId: order._id.toString(), groupId: group._id.toString() },
    }).catch(() => {});
  }

  return group;
}

async function generate940ForGroup(group, order, shop) {
  if (group.edi940DocumentId) {
    const EdiDocument = require("../edi/documentModel");
    const existing = await EdiDocument.findById(group.edi940DocumentId);
    if (existing?.body) {
      return {
        document: existing.toPublic(),
        link: group.fileLink || null,
        body: existing.body,
        fileName: existing.storageKey || `940-${order.orderNumber || order.shopifyOrderId}.edi`,
      };
    }
  }

  const orderForEdi = {
    ...order.toObject(),
    lineItems: (group.lines || []).map((l) => ({
      id: l.orderLineId,
      sku: l.sku,
      title: l.title,
      quantity: l.allocatedQty || l.quantity,
    })),
    toEdiPayload() {
      return {
        shopifyOrderId: order.shopifyOrderId,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        shippingAddress: order.shippingAddress,
        lineItems: this.lineItems,
      };
    },
  };

  const file = await edi.create940({
    order: orderForEdi,
    shop,
    warehouseId: group.warehouseId,
  });

  group.edi940DocumentId = file.document?.id || file.document?._id || null;
  group.fileLink = file.link;
  group.status = group.status === "on_hold" ? "on_hold" : "allocated";
  await group.save();
  return file;
}

/**
 * Allocate order into fulfillment groups, reserve stock, emit 940s.
 */
async function allocateOrder(order, shop, options = {}) {
  if (["fulfilled", "partially_fulfilled", "partially_returned", "returned", "cancelled"].includes(order.status)) {
    throw httpError(400, "Cannot allocate an order that is already shipped or cancelled");
  }

  // Always clear previous open groups first — avoids double-reserve / duplicate groups
  await clearOpenAllocation(order);

  const planResult = await allocate.planAllocation(order, shop.companyId, {
    forceWarehouseId: options.forceWarehouseId || null,
  });

  order.lineItems = planResult.lines;
  if (planResult.missingSkus?.length) {
    const message = planResult.reason || `Product not found: ${planResult.missingSkus.join(", ")}`;
    order.status = "error";
    order.lastError = message;
    order.routingReason = message;
    order.suggestedWarehouseId = null;
    await order.save();
    const dlq = require("../orders/failedOrderService");
    await dlq.create({
      orderId: order._id,
      shopId: order.shopId,
      companyId: shop.companyId,
      reason: "PRODUCT_NOT_FOUND",
      errorMessage: message,
    });
    return { order, groups: [], hold: false, failed: true };
  }
  if (planResult.noRouteMatch) {
    const message = planResult.reason || "No warehouse matched and no fallback configured";
    order.status = "error";
    order.lastError = message;
    order.routingReason = message;
    order.warehouseId = null;
    order.suggestedWarehouseId = null;
    await order.save();
    const dlq = require("../orders/failedOrderService");
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
    return { order, groups: [], hold: false, failed: true };
  }
  if (planResult.hold) {
    order.status = "on_hold";
    order.routingReason = planResult.reason;
    await order.save();
    await saga.advance(order._id, "ON_HOLD", "allocate").catch(() => {});
    const notifications = require("../notifications");
    notifications.create({
      companyId: shop.companyId,
      type: "order_error",
      title: `Order ${order.orderNumber} on hold`,
      message: planResult.reason,
      meta: { orderId: order._id.toString() },
    }).catch(() => {});
    return { order, groups: [], hold: true };
  }

  if (!planResult.plan.size) {
    // Prefer leaving the order actionable instead of fake "940_ready" with no warehouse.
    if (planResult.config?.enabled && !options.forceWarehouseId) {
      order.status = "received";
      order.routingReason = planResult.reason || order.routingReason || "No stock to allocate";
      await order.save();
      return { order, groups: [], hold: false, empty: true };
    }
    order.status = order.status === "received" ? "940_ready" : order.status;
    await order.save();
    return { order, groups: [], hold: false };
  }

  await saga.advance(order._id, "ALLOCATED", "allocate").catch(() => {});

  const groups = await allocate.createGroupsFromPlan(order, shop, planResult);
  const config = planResult.config || {};
  const autoDeliverSftp = config.autoDeliverSftp !== false;

  let primaryWarehouse = null;
  let primaryLink = null;
  const Warehouse = require("../companies/warehouseModel");

  for (const group of groups) {
    try {
      await saga.startStep(order._id, `generate_940_${group._id}`);
      const file = await generate940ForGroup(group, order, shop);

      const warehouse = group.warehouseId
        ? await Warehouse.findById(group.warehouseId)
        : null;
      const useModernwms = warehouse?.fulfillmentMode === "modernwms";

      if (useModernwms) {
        group.sftpStatus = "skipped";
        group.metadata = group.metadata || {};
        group.metadata.modernwmsPushStatus = "pending";
        await group.save();
        runAfterResponse(`modernwms-push-${group._id}`, async () => {
          const modernwms = require("../modernwms");
          try {
            await modernwms.pushOrder({ group, order, shop, warehouse });
            group.metadata = group.metadata || {};
            group.metadata.modernwmsPushStatus = "pushed";
            await group.save();
          } catch (error) {
            group.metadata.modernwmsPushStatus = "failed";
            await group.save().catch(() => {});
            await notifyModernwmsPushFailed(error, { group, order, shop });
          }
        });
      } else if (autoDeliverSftp && warehouse?.sftpConnectionId) {
        group.sftpStatus = "pending";
        await group.save();
        runAfterResponse(`sftp-deliver-${group._id}`, async () => {
          await deliver940(group, order, shop, file, autoDeliverSftp);
          const Order = require("../orders/model");
          if (group.sftpStatus === "sent") {
            await saga.advance(order._id, "SENT_TO_3PL", `deliver_sftp_${group._id}`).catch(() => {});
            await Order.findByIdAndUpdate(order._id, { sftpStatus: "sent", sftpError: "" }).catch(() => {});
          } else if (group.sftpStatus === "failed") {
            await Order.findByIdAndUpdate(order._id, {
              sftpStatus: "failed",
              sftpError: group.sftpError || "SFTP delivery failed",
            }).catch(() => {});
          }
        });
      } else {
        await deliver940(group, order, shop, file, autoDeliverSftp);
      }

      if (!primaryWarehouse) {
        primaryWarehouse = group.warehouseId;
        primaryLink = file.link;
      }
      if (group.sftpStatus === "sent") {
        await saga.advance(order._id, "SENT_TO_3PL", `deliver_sftp_${group._id}`).catch(() => {});
      }
    } catch (error) {
      logger.error({ err: error, groupId: group._id.toString() }, "940 generation failed for group");
      await saga.failStep(order._id, `generate_940_${group._id}`, error.message).catch(() => {});
    }
  }

  await saga.advance(order._id, "940_GENERATED", "generate_940").catch(() => {});

  order.warehouseId = primaryWarehouse || order.warehouseId;
  order.suggestedWarehouseId = null;
  order.fileLink = primaryLink || order.fileLink;
  order.status = "940_ready";
  order.sftpStatus = groups.some((g) => g.sftpStatus === "sent")
    ? "sent"
    : groups.some((g) => g.sftpStatus === "failed")
      ? "failed"
      : groups.some((g) => g.sftpStatus === "pending")
        ? "pending"
        : "skipped";
  order.routingReason = planResult.reason || order.routingReason;
  order.lastError = "";
  await order.save();

  logs.logOrderTransition({
    orderId: order._id,
    companyId: shop.companyId,
    fromState: "received",
    toState: "940_ready",
    message: `Allocated into ${groups.length} fulfillment group(s)`,
  }).catch(() => {});

  // When every line is allocated, mark Shopify fulfillment orders In progress
  const shops = require("../shops");
  const fullyAllocated = require("../shopify/fulfillment").isFullyAllocated(order.lineItems);
  if (fullyAllocated && order.source !== "demo" && shops.isProcessable(shop)) {
    runAfterResponse(`shopify-in-progress-${order._id}`, async () => {
      try {
        const shopify = require("../shopify");
        const progress = await shopify.markOrderInProgress({
          shop,
          order,
          message: `WMS allocated to ${groups.length} warehouse group(s)`,
        });
        if (progress.errors?.length) {
          order.lastError = `Shopify in-progress: ${progress.errors.map((e) => e.error).join("; ")}`;
          await order.save();
        }
      } catch (error) {
        logger.warn({ err: error, orderId: String(order._id) }, "Failed to mark Shopify order in progress");
        order.lastError = `Shopify in-progress failed: ${error.message}`;
        await order.save();
        logs.logShopifyApi({
          orderId: order._id,
          companyId: shop.companyId,
          mutation: "fulfillmentOrderReportProgress",
          status: "error",
          userErrors: [{ message: error.message }],
        }).catch(() => {});
      }
    });
  }

  return { order, groups, hold: false };
}

async function getOrderFulfillment(orderId) {
  const Order = require("../orders/model");
  const logs = require("../logs");
  const Return = require("./returnModel");
  const [order, groups, shipments, activity, returns] = await Promise.all([
    Order.findById(orderId),
    FulfillmentGroup.find({ orderId, status: { $ne: "cancelled" } }).sort({ createdAt: 1 }),
    Shipment.find({ orderId }).sort({ createdAt: 1 }),
    logs.listForOrder(orderId).catch(() => []),
    Return.find({ orderId }).sort({ createdAt: -1 }),
  ]);
  if (!order) throw httpError(404, "Order not found");
  return {
    order: order.toPublic(),
    groups: groups.map((g) => g.toPublic()),
    shipments: shipments.map((s) => s.toPublic()),
    logs: activity,
    returns: returns.map((r) => r.toPublic()),
  };
}

async function recomputeOrderStatus(order) {
  const groups = await FulfillmentGroup.find({
    orderId: order._id,
    status: { $ne: "cancelled" },
  });
  if (!groups.length) return order;

  const shipped = groups.filter((g) => g.status === "shipped").length;
  if (shipped === groups.length) {
    order.status = "fulfilled";
  } else if (shipped > 0) {
    order.status = "partially_fulfilled";
  }
  await order.save();
  return order;
}

/**
 * Ship a fulfillment group: create shipment, ingest 945, Shopify fulfill, consume inventory.
 */
async function shipGroup({ groupId, trackingNumber, carrier, body, fileName, fulfill }) {
  const group = await FulfillmentGroup.findById(groupId);
  if (!group) throw httpError(404, "Fulfillment group not found");
  if (group.status === "shipped") throw httpError(400, "Group already shipped");
  if (group.status === "on_hold") throw httpError(400, "Group is on hold");
  if (group.status === "cancelled") throw httpError(400, "Group is cancelled");

  const Order = require("../orders/model");
  const shops = require("../shops");
  const order = await Order.findById(group.orderId);
  if (!order) throw httpError(404, "Order not found");
  if (order.status === "cancelled") throw httpError(400, "Order is cancelled");

  const shop = await shops.getById(order.shopId);

  let ediBody = body;
  if (!ediBody) {
    if (!trackingNumber) throw httpError(400, "Tracking number is required");
    const orderForEdi = {
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
    };
    ediBody = edi.sample945({
      order: orderForEdi,
      trackingNumber,
      carrier: carrier || "UPS",
    });
    fileName = fileName || `945-${order.orderNumber}-${group._id}.edi`;
  }

  const result = await edi.ingest945({ order, shop, body: ediBody, fileName });
  const track = result.parsed.trackingNumber || trackingNumber || result.parsed.shipmentId;
  const shipCarrier = result.parsed.carrier || carrier || "";

  const shipment = await Shipment.create({
    orderId: order._id,
    fulfillmentGroupId: group._id,
    companyId: shop.companyId,
    warehouseId: group.warehouseId,
    status: "labeled",
    carrier: shipCarrier,
    trackingNumber: track,
    packages: [{ items: group.lines }],
    edi945DocumentId: result.document?.id || null,
    statusHistory: [
      {
        status: "labeled",
        note: "Label created / handed to carrier",
        source: "ship",
        at: new Date(),
      },
    ],
  });

  group.status = "shipped";
  group.shipmentId = shipment._id;
  await group.save();

  // Update line shipped qty on order
  const lines = allocate.enrichLineItems(order.lineItems);
  for (const gl of group.lines || []) {
    const line = lines.find((l) => l.id === gl.orderLineId || l.sku === gl.sku);
    if (line) {
      line.shippedQty = (line.shippedQty || 0) + (gl.allocatedQty || gl.quantity || 0);
      if (line.shippedQty >= line.quantity) line.status = "fulfilled";
      else if (line.shippedQty > 0) line.status = "partial";
    }
    if (group.warehouseId && gl.sku) {
      await inventory.consumeReserved({
        warehouseId: group.warehouseId,
        sku: gl.sku,
        quantity: gl.allocatedQty || gl.quantity,
      });
    }
  }
  order.lineItems = lines;
  order.trackingNumber = track;
  order.carrier = shipCarrier;
  order.status = "945_received";
  await order.save();

  await saga.advance(order._id, "945_RECEIVED", "receive_945").catch(() => {});

  const notifications = require("../notifications");
  notifications.create({
    companyId: shop.companyId,
    type: "945_received",
    title: `945 received for order ${order.orderNumber}`,
    message: `Tracking: ${track || "N/A"}, Carrier: ${shipCarrier || "N/A"}`,
    meta: { orderId: order._id.toString(), groupId: group._id.toString(), shipmentId: shipment._id.toString() },
  }).catch(() => {});

  let shopifyError = null;
  let shopifySynced = false;
  const shouldFulfill = order.source !== "demo" && shops.isProcessable(shop) && typeof fulfill === "function";
  if (shouldFulfill && shipment.shopifyFulfillmentId && String(shipment.shopifyFulfillmentId).includes("Fulfillment")) {
    shopifySynced = true;
  } else if (shouldFulfill) {
    try {
      await saga.startStep(order._id, "create_fulfillment");
      const shopifyFulfillment = await fulfill({
        shop,
        order,
        lines: group.lines || [],
        trackingNumber: track,
        carrier: shipCarrier,
        idempotencyKey: `ship-${group._id}-${shipment._id}`,
      });
      shipment.shopifyFulfillmentId = shopifyFulfillment?.id || order.fulfillmentIdempotencyKey || "created";
      await shipment.save();
      // Seed Shopify tracking as labeled / ready
      if (shopifyFulfillment?.id) {
        require("../shopify/fulfillment")
          .createFulfillmentTrackingEvent({
            shop,
            order,
            shopifyFulfillmentId: shopifyFulfillment.id,
            status: "labeled",
            message: `Shipment labeled · ${track || "no tracking"}`,
          })
          .catch((err) => logger.warn({ err }, "Shopify labeled event failed"));
      }
      order.lastError = "";
      await order.save();
      shopifySynced = true;
      await saga.advance(order._id, "FULFILLED", "create_fulfillment").catch(() => {});
    } catch (error) {
      shopifyError = error.message || String(error);
      order.lastError = `Shopify fulfill failed: ${shopifyError}`;
      await order.save();
      await saga.failStep(order._id, "create_fulfillment", shopifyError).catch(() => {});
      notifications.create({
        companyId: shop.companyId,
        type: "order_error",
        title: `Shopify fulfill failed for ${order.orderNumber}`,
        message: shopifyError,
        meta: { orderId: order._id.toString(), groupId: group._id.toString() },
      }).catch(() => {});
    }
  } else if (order.source === "demo") {
    shopifySynced = true; // N/A
  } else if (!shops.isProcessable(shop)) {
    shopifyError = "Shopify shop is not processable (missing token or disabled)";
    order.lastError = shopifyError;
    await order.save();
  }

  await recomputeOrderStatus(order);
  const fresh = await Order.findById(order._id);

  if (fresh.status === "fulfilled") {
    notifications.create({
      companyId: shop.companyId,
      type: "order_fulfilled",
      title: `Order ${order.orderNumber} fulfilled`,
      message: `All shipments complete. Tracking: ${track || "N/A"}`,
      meta: { orderId: order._id.toString() },
    }).catch(() => {});
    await saga.advance(order._id, "FULFILLED", "complete").catch(() => {});
  }

  return {
    order: fresh.toPublic(),
    group: group.toPublic(),
    shipment: shipment.toPublic(),
    shopifySynced,
    shopifyError,
  };
}

/**
 * Re-push an already-shipped group to Shopify (partial or full).
 * Use when WMS marked shipped but Shopify still shows unfulfilled.
 */
async function syncGroupToShopify({ groupId, fulfill }) {
  const group = await FulfillmentGroup.findById(groupId);
  if (!group) throw httpError(404, "Fulfillment group not found");
  if (group.status !== "shipped") {
    throw httpError(400, "Group must be shipped before syncing to Shopify");
  }

  const Order = require("../orders/model");
  const shops = require("../shops");
  const order = await Order.findById(group.orderId);
  if (!order) throw httpError(404, "Order not found");
  if (order.source === "demo") throw httpError(400, "Demo orders are not synced to Shopify");

  const shop = await shops.getById(order.shopId);
  if (!shops.isProcessable(shop)) {
    throw httpError(400, "Shopify shop is not processable (missing token or disabled)");
  }
  if (typeof fulfill !== "function") {
    throw httpError(500, "Shopify fulfill handler unavailable");
  }

  let shipment = null;
  if (group.shipmentId) {
    shipment = await Shipment.findById(group.shipmentId);
  }
  if (!shipment) {
    shipment = await Shipment.findOne({ fulfillmentGroupId: group._id }).sort({ createdAt: -1 });
  }

  const track = shipment?.trackingNumber || order.trackingNumber || "";
  const shipCarrier = shipment?.carrier || order.carrier || "";
  const stableKey = shipment
    ? `ship-${group._id}-${shipment._id}`
    : `ship-${group._id}`;

  if (shipment?.shopifyFulfillmentId && String(shipment.shopifyFulfillmentId).includes("Fulfillment")) {
    return {
      order: order.toPublic(),
      group: group.toPublic(),
      shipment: shipment.toPublic(),
      shopifyFulfillmentId: shipment.shopifyFulfillmentId,
      skipped: true,
      reason: "already_synced",
    };
  }

  const shopifyFulfillment = await fulfill({
    shop,
    order,
    lines: group.lines || [],
    trackingNumber: track,
    carrier: shipCarrier,
    idempotencyKey: stableKey,
  });

  if (shipment) {
    shipment.shopifyFulfillmentId = shopifyFulfillment?.id || stableKey;
    await shipment.save();
  }

  order.lastError = "";
  await order.save();
  await recomputeOrderStatus(order);
  const fresh = await Order.findById(order._id);

  return {
    order: fresh.toPublic(),
    group: group.toPublic(),
    shipment: shipment ? shipment.toPublic() : null,
    shopifyFulfillmentId: shopifyFulfillment?.id || null,
  };
}

/**
 * Sync every shipped group on an order that is missing a Shopify fulfillment id.
 */
async function syncOrderToShopify({ orderId, fulfill, force = false }) {
  const Order = require("../orders/model");
  const shops = require("../shops");
  const order = await Order.findById(orderId);
  if (!order) throw httpError(404, "Order not found");
  if (order.source === "demo") throw httpError(400, "Demo orders are not synced to Shopify");

  const shop = await shops.getById(order.shopId);
  if (!shops.isProcessable(shop)) {
    throw httpError(400, "Shopify shop is not processable (missing token or disabled)");
  }

  const groups = await FulfillmentGroup.find({
    orderId: order._id,
    status: "shipped",
  }).sort({ createdAt: 1 });

  if (!groups.length) {
    throw httpError(400, "No shipped fulfillment groups to sync");
  }

  const results = [];
  const errors = [];

  for (const group of groups) {
    let shipment = null;
    if (group.shipmentId) {
      shipment = await Shipment.findById(group.shipmentId);
    }
    if (!shipment) {
      shipment = await Shipment.findOne({ fulfillmentGroupId: group._id }).sort({ createdAt: -1 });
    }

    const alreadySynced = Boolean(shipment?.shopifyFulfillmentId);
    if (alreadySynced && !force) {
      results.push({
        groupId: group._id.toString(),
        skipped: true,
        shopifyFulfillmentId: shipment.shopifyFulfillmentId,
      });
      continue;
    }

    try {
      const synced = await syncGroupToShopify({ groupId: group._id, fulfill });
      results.push({
        groupId: group._id.toString(),
        skipped: false,
        shopifyFulfillmentId: synced.shopifyFulfillmentId,
      });
    } catch (error) {
      errors.push({
        groupId: group._id.toString(),
        error: error.message || String(error),
      });
    }
  }

  const fresh = await Order.findById(order._id);
  if (errors.length && !results.some((r) => r.shopifyFulfillmentId && !r.skipped)) {
    fresh.lastError = `Shopify sync failed: ${errors.map((e) => e.error).join("; ")}`;
    await fresh.save();
  } else if (!errors.length) {
    fresh.lastError = "";
    await fresh.save();
  }

  return {
    order: fresh.toPublic(),
    results,
    errors,
    syncedCount: results.filter((r) => r.shopifyFulfillmentId && !r.skipped).length,
  };
}

async function cancelOrderFulfillment(order, shop) {
  const modernwms = require("../modernwms");
  await modernwms.cancelDispatchForOrder(order._id).catch(() => {});

  const groups = await FulfillmentGroup.find({
    orderId: order._id,
    status: { $nin: ["shipped", "cancelled"] },
  });
  await allocate.releaseGroups(groups);
  await FulfillmentGroup.updateMany(
    { _id: { $in: groups.map((g) => g._id) } },
    { $set: { status: "cancelled" } }
  );
  await saga.advance(order._id, "CANCELLED", "cancel").catch(() => {});
}

/**
 * Clear warehouse allocation so the order can be assigned again.
 * Blocked once any fulfillment group has shipped (or order is fulfilled/partial/cancelled).
 */
async function unallocateOrder(order, shop) {
  if (["fulfilled", "partially_fulfilled", "partially_returned", "returned", "cancelled"].includes(order.status)) {
    throw httpError(400, "Cannot clear allocation after the order has shipped or been cancelled");
  }

  const shipped = await FulfillmentGroup.findOne({
    orderId: order._id,
    status: "shipped",
  }).lean();
  if (shipped) {
    throw httpError(400, "Cannot clear allocation after a product has shipped");
  }

  const modernwms = require("../modernwms");
  await modernwms.cancelDispatchForOrder(order._id).catch(() => {});

  const groups = await FulfillmentGroup.find({
    orderId: order._id,
    status: { $ne: "cancelled" },
  });
  await allocate.releaseGroups(groups);
  await FulfillmentGroup.updateMany(
    { _id: { $in: groups.map((g) => g._id) } },
    { $set: { status: "cancelled" } }
  );

  order.warehouseId = null;
  order.suggestedWarehouseId = null;
  order.routingRuleId = null;
  order.routingReason = "";
  order.status = "received";
  order.sftpStatus = "skipped";
  order.sftpError = "";
  order.lastError = "";
  order.fileLink = null;
  order.trackingNumber = "";
  order.carrier = "";
  order.lineItems = (order.lineItems || []).map((line) => ({
    ...(typeof line.toObject === "function" ? line.toObject() : line),
    allocatedQty: 0,
    status: "open",
  }));
  await order.save();

  const logs = require("../logs");
  logs
    .logOrderTransition({
      orderId: order._id,
      companyId: shop.companyId,
      fromState: "allocated",
      toState: "received",
      message: `Allocation cleared for order ${order.orderNumber}`,
      meta: { orderNumber: order.orderNumber },
    })
    .catch(() => {});

  return { order, groups: [] };
}

/**
 * Drop open (non-shipped) groups + release stock before creating a new plan.
 */
async function clearOpenAllocation(order) {
  const shipped = await FulfillmentGroup.findOne({
    orderId: order._id,
    status: "shipped",
  }).lean();
  if (shipped) {
    throw httpError(400, "Cannot reallocate after a product has shipped");
  }

  const modernwms = require("../modernwms");
  await modernwms.cancelDispatchForOrder(order._id).catch(() => {});

  const openGroups = await FulfillmentGroup.find({
    orderId: order._id,
    status: { $nin: ["shipped", "cancelled"] },
  });
  if (openGroups.length) {
    await allocate.releaseGroups(openGroups);
    await FulfillmentGroup.updateMany(
      { _id: { $in: openGroups.map((g) => g._id) } },
      { $set: { status: "cancelled" } }
    );
  }

  // Reset line allocation so planAllocation sees remaining demand
  order.lineItems = (order.lineItems || []).map((line) => ({
    ...(typeof line.toObject === "function" ? line.toObject() : line),
    allocatedQty: 0,
    status: "open",
  }));
  order.fileLink = null;
  order.sftpStatus = "skipped";
  order.sftpError = "";
}

const SHIPMENT_FLOW = [
  "pending",
  "labeled",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

const STATUS_NOTES = {
  pending: "Awaiting handoff",
  labeled: "Label created / ready for pickup",
  in_transit: "On the way — in transit with carrier",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered to customer",
  failed: "Delivery failed",
  returned: "Returned to sender",
};

function assertShipmentTransition(from, to) {
  if (!to || from === to) {
    throw httpError(400, "Choose a different shipment status");
  }
  const allowed = Shipment.SHIPMENT_STATUSES || [
    "pending",
    "labeled",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "failed",
    "returned",
  ];
  if (!allowed.includes(to)) {
    throw httpError(400, `Invalid shipment status: ${to}`);
  }
  // After delivery, only a customer/RTS return is allowed
  if (from === "delivered" && to !== "returned") {
    throw httpError(400, "Delivered shipments can only move to returned");
  }
}

/**
 * Advance a shipment through real-world transit states and sync to Shopify.
 */
async function updateShipmentStatus({
  shipmentId,
  companyId,
  status,
  note,
  happenedAt,
  trackingUrl,
  source = "manual",
}) {
  const shipment = await Shipment.findById(shipmentId);
  if (!shipment) throw httpError(404, "Shipment not found");
  if (String(shipment.companyId) !== String(companyId)) {
    throw httpError(404, "Shipment not found");
  }

  const next = String(status || "").trim();
  assertShipmentTransition(shipment.status, next);

  const Order = require("../orders/model");
  const shops = require("../shops");
  const order = await Order.findById(shipment.orderId);
  if (!order) throw httpError(404, "Order not found");
  const shop = await shops.getById(order.shopId);

  const eventNote = note || STATUS_NOTES[next] || next;
  const at = happenedAt ? new Date(happenedAt) : new Date();

  shipment.status = next;
  if (trackingUrl !== undefined) {
    shipment.trackingUrl = String(trackingUrl || "");
  }
  shipment.statusHistory = shipment.statusHistory || [];
  shipment.statusHistory.push({
    status: next,
    note: eventNote,
    source: source || "manual",
    at,
  });
  await shipment.save();

  logs.logOrderTransition({
    orderId: order._id,
    companyId: shipment.companyId,
    fromState: "shipment",
    toState: next,
    message: `Shipment ${shipment.trackingNumber || shipment._id}: ${eventNote}`,
    meta: { shipmentId: shipment._id.toString(), status: next, source },
  }).catch(() => {});

  let shopifyEvent = null;
  let shopifyError = null;
  if (order.source !== "demo" && shops.isProcessable(shop) && shipment.shopifyFulfillmentId) {
    try {
      shopifyEvent = await require("../shopify/fulfillment").createFulfillmentTrackingEvent({
        shop,
        order,
        shopifyFulfillmentId: shipment.shopifyFulfillmentId,
        status: next,
        message: eventNote,
        happenedAt: at,
      });
    } catch (error) {
      shopifyError = error.message || String(error);
      logger.warn({ err: error, shipmentId: String(shipment._id) }, "Shopify tracking event failed");
    }
  }

  const notifications = require("../notifications");
  if (next === "delivered") {
    notifications.create({
      companyId: shipment.companyId,
      type: "order_fulfilled",
      title: `Shipment delivered · ${order.orderNumber}`,
      message: eventNote,
      meta: { orderId: order._id.toString(), shipmentId: shipment._id.toString() },
    }).catch(() => {});
  } else if (next === "failed" || next === "returned") {
    notifications.create({
      companyId: shipment.companyId,
      type: "order_error",
      title: `Shipment ${next.replace(/_/g, " ")} · ${order.orderNumber}`,
      message: eventNote,
      meta: { orderId: order._id.toString(), shipmentId: shipment._id.toString() },
    }).catch(() => {});
  }

  let autoReturn = null;
  if (next === "returned") {
    try {
      autoReturn = await require("./returns").createFromShipmentReturn(shipment, order, {
        note: eventNote,
      });
    } catch (error) {
      logger.warn({ err: error, shipmentId: String(shipment._id) }, "Auto RMA from shipment return failed");
    }
  }

  return {
    shipment: shipment.toPublic(),
    order: order.toPublic(),
    shopifyEvent,
    shopifyError,
    allowedNext: allowedNextStatuses(next),
    return: autoReturn,
  };
}

function allowedNextStatuses(current) {
  if (current === "delivered") return ["returned"];
  if (current === "failed" || current === "returned") {
    return ["labeled", "in_transit", "out_for_delivery", "delivered"];
  }
  const idx = SHIPMENT_FLOW.indexOf(current);
  const forward = idx >= 0 ? SHIPMENT_FLOW.slice(idx + 1) : SHIPMENT_FLOW.slice(1);
  return [...forward, "failed", "returned"].filter((s, i, arr) => arr.indexOf(s) === i);
}

module.exports = {
  allocateOrder,
  unallocateOrder,
  getOrderFulfillment,
  shipGroup,
  syncGroupToShopify,
  syncOrderToShopify,
  updateShipmentStatus,
  allowedNextStatuses,
  cancelOrderFulfillment,
  recomputeOrderStatus,
  generate940ForGroup,
  STATUS_NOTES,
  returns: require("./returns"),
};
