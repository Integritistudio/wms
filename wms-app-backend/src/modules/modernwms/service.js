const ModernWmsLink = require("./model");
const { clientFromWarehouse, ModernWmsClient } = require("./client");
const mapper = require("./mapper");
const logger = require("../../config/logger");
const { encrypt } = require("../../utils/secret");
const env = require("../../config/env");

const DELIVERED_STATUS = 6;

function publicModernwmsConfig(warehouse) {
  const cfg = warehouse.modernwms || {};
  return {
    baseUrl: cfg.baseUrl || env.modernwmsDefaultBaseUrl,
    username: cfg.username || "",
    passwordSet: Boolean(cfg.passwordEncrypted),
    tenantId: cfg.tenantId ?? null,
    goodsOwnerId: cfg.goodsOwnerId ?? null,
    defaultCustomerId: cfg.defaultCustomerId ?? null,
    autoConfirmOrder: Boolean(cfg.autoConfirmOrder),
    webhookRegistered: Boolean(cfg.webhookSubscriptionId),
    webhookRegisteredAt: cfg.webhookRegisteredAt || null,
  };
}

async function getWarehouse(companyId, warehouseId) {
  const Warehouse = require("../companies/warehouseModel");
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    const { httpError } = require("../../utils/httpError");
    throw httpError(404, "Warehouse not found");
  }
  return warehouse;
}

async function getModernwmsConfig(companyId, warehouseId) {
  const warehouse = await getWarehouse(companyId, warehouseId);
  return {
    warehouseId: warehouse._id.toString(),
    fulfillmentMode: warehouse.fulfillmentMode || "sftp_edi",
    modernwms: publicModernwmsConfig(warehouse),
  };
}

async function updateModernwmsConfig(companyId, warehouseId, payload = {}) {
  const warehouse = await getWarehouse(companyId, warehouseId);
  warehouse.modernwms = warehouse.modernwms || {};

  if (payload.baseUrl !== undefined) {
    warehouse.modernwms.baseUrl = String(payload.baseUrl || "").trim();
  }
  if (payload.username !== undefined) {
    warehouse.modernwms.username = String(payload.username || "").trim();
  }
  if (payload.password) {
    warehouse.modernwms.passwordEncrypted = encrypt(String(payload.password));
  }
  if (payload.tenantId !== undefined) {
    warehouse.modernwms.tenantId = payload.tenantId === null || payload.tenantId === ""
      ? null
      : Number(payload.tenantId);
  }
  if (payload.goodsOwnerId !== undefined) {
    warehouse.modernwms.goodsOwnerId = payload.goodsOwnerId === null || payload.goodsOwnerId === ""
      ? null
      : Number(payload.goodsOwnerId);
  }
  if (payload.defaultCustomerId !== undefined) {
    warehouse.modernwms.defaultCustomerId = payload.defaultCustomerId === null || payload.defaultCustomerId === ""
      ? null
      : Number(payload.defaultCustomerId);
  }
  if (payload.autoConfirmOrder !== undefined) {
    warehouse.modernwms.autoConfirmOrder = Boolean(payload.autoConfirmOrder);
  }
  if (payload.fulfillmentMode !== undefined) {
    warehouse.fulfillmentMode = payload.fulfillmentMode === "modernwms" ? "modernwms" : "sftp_edi";
  }

  await warehouse.save();

  try {
    if (warehouse.fulfillmentMode === "modernwms") {
      await registerInventoryWebhook(warehouse);
    } else {
      await unregisterInventoryWebhook(warehouse);
    }
  } catch (error) {
    logger.warn(
      { err: error, warehouseId: String(warehouse._id) },
      "ModernWMS inventory webhook registration failed"
    );
  }

  return getModernwmsConfig(companyId, warehouseId);
}

function webhookCallbackUrl(warehouseId) {
  return env.shopifyApiUrl(`/modernwms/webhooks/${warehouseId}`);
}

async function registerInventoryWebhook(warehouse) {
  const crypto = require("crypto");
  const { decrypt } = require("../../utils/secret");
  warehouse.modernwms = warehouse.modernwms || {};

  let secret = "";
  try {
    secret = warehouse.modernwms.webhookSecretEncrypted
      ? decrypt(warehouse.modernwms.webhookSecretEncrypted)
      : "";
  } catch {
    secret = "";
  }
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    warehouse.modernwms.webhookSecretEncrypted = encrypt(secret);
  }

  const client = clientFromWarehouse(warehouse);
  const data = await client.upsertWebhookSubscription({
    callbackUrl: webhookCallbackUrl(warehouse._id.toString()),
    secret,
    events: "inventory.quantity_changed",
    enabled: true,
  });

  const subId = data?.id ?? data?.Id ?? null;
  if (subId) {
    warehouse.modernwms.webhookSubscriptionId = Number(subId);
    warehouse.modernwms.webhookRegisteredAt = new Date();
    await warehouse.save();
  }
  return data;
}

async function unregisterInventoryWebhook(warehouse) {
  warehouse.modernwms = warehouse.modernwms || {};
  const subId = warehouse.modernwms.webhookSubscriptionId;
  if (subId) {
    try {
      const client = clientFromWarehouse(warehouse);
      await client.deleteWebhookSubscription(subId);
    } catch (error) {
      logger.warn(
        { err: error, warehouseId: String(warehouse._id), subId },
        "ModernWMS webhook unsubscribe failed"
      );
    }
  }
  warehouse.modernwms.webhookSubscriptionId = null;
  warehouse.modernwms.webhookRegisteredAt = null;
  warehouse.modernwms.webhookSecretEncrypted = "";
  await warehouse.save();
}

async function testConnection(companyId, warehouseId, payload = {}) {
  const warehouse = await getWarehouse(companyId, warehouseId);
  let client;

  const inlineUrl = String(payload.baseUrl || "").trim();
  const inlineUser = String(payload.username || "").trim();
  const inlinePass = payload.password ? String(payload.password) : "";

  if (inlineUrl && inlineUser && inlinePass) {
    client = new ModernWmsClient({
      baseUrl: inlineUrl,
      username: inlineUser,
      password: inlinePass,
    });
  } else {
    client = clientFromWarehouse(warehouse);
  }

  const result = await client.testConnection();
  if (result.tenantId) {
    warehouse.modernwms = warehouse.modernwms || {};
    if (!warehouse.modernwms.tenantId) {
      warehouse.modernwms.tenantId = result.tenantId;
    }
    if (inlineUrl && !warehouse.modernwms.baseUrl) {
      warehouse.modernwms.baseUrl = inlineUrl;
    }
    await warehouse.save();
  }
  return result;
}

async function pushOrder({ group, order, shop, warehouse }) {
  const existing = await ModernWmsLink.findOne({ groupId: group._id });
  if (existing?.dispatchNo) {
    return existing;
  }

  const client = clientFromWarehouse(warehouse);
  const lines = await mapper.buildDispatchLines({ client, group, order, warehouse });
  await client.createDispatch(lines);

  const customerId = Number(warehouse.modernwms?.defaultCustomerId || 0);
  const marker = order.orderNumber ? `#${order.orderNumber}` : "";
  const dispatchNo = await mapper.findDispatchNoAfterCreate(client, customerId, marker);
  if (!dispatchNo) {
    throw new Error("ModernWMS dispatch created but dispatch_no could not be resolved");
  }

  if (warehouse.modernwms?.autoConfirmOrder) {
    try {
      const details = await client.getDispatchByNo(dispatchNo);
      if (details?.length) {
        await client.confirmOrder(details);
      }
    } catch (error) {
      logger.warn({ err: error, dispatchNo }, "ModernWMS autoConfirmOrder failed");
    }
  }

  const link = await ModernWmsLink.findOneAndUpdate(
    { groupId: group._id },
    {
      $set: {
        orderId: order._id,
        companyId: shop.companyId,
        warehouseId: warehouse._id,
        dispatchNo,
        dispatchStatus: 0,
        tenantId: warehouse.modernwms?.tenantId ?? client.tenantId ?? null,
        pushError: "",
        closed: false,
        lastPolledAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  group.metadata = group.metadata || {};
  group.metadata.modernwmsDispatchNo = dispatchNo;
  group.metadata.modernwmsStatus = 0;
  group.sftpStatus = "skipped";
  await group.save();

  return link;
}

async function pollDispatchStatus(link, warehouse) {
  if (!link.dispatchNo) return link;
  const client = clientFromWarehouse(warehouse);
  const rows = await client.getDispatchByNo(link.dispatchNo);
  if (!rows?.length) return link;

  const status = Math.max(...rows.map((r) => Number(r.dispatch_status || 0)));
  const primary = rows[0] || {};
  link.dispatchStatus = status;
  link.lastPolledAt = new Date();
  await link.save();

  const FulfillmentGroup = require("../fulfillment/groupModel");
  const group = await FulfillmentGroup.findById(link.groupId);
  if (group) {
    group.metadata = group.metadata || {};
    group.metadata.modernwmsDispatchNo = link.dispatchNo;
    group.metadata.modernwmsStatus = status;
    await group.save();
  }

  if (status >= DELIVERED_STATUS && !link.closed) {
    const fulfillment = require("../fulfillment");
    const shopify = require("../shopify");
    const Shipment = require("../fulfillment/shipmentModel");

    const existingShipment = await Shipment.findOne({ fulfillmentGroupId: link.groupId });
    if (existingShipment || group?.status === "shipped") {
      link.closed = true;
      link.closedAt = new Date();
      await link.save();
      return link;
    }

    const trackingNumber = primary.waybill_no || primary.package_no || `MWMS-${link.dispatchNo}`;
    const carrier = primary.carrier || "Carrier";

    await fulfillment.shipGroup({
      groupId: link.groupId,
      trackingNumber,
      carrier,
      fulfill: shopify.fulfillOrder,
    });

    link.closed = true;
    link.closedAt = new Date();
    link.dispatchStatus = status;
    await link.save();
  }

  return link;
}

async function pollOpenLinks() {
  const Warehouse = require("../companies/warehouseModel");
  const links = await ModernWmsLink.find({ closed: { $ne: true } }).limit(50);
  let processed = 0;

  for (const link of links) {
    try {
      const warehouse = await Warehouse.findById(link.warehouseId);
      if (!warehouse || warehouse.fulfillmentMode !== "modernwms") continue;
      await pollDispatchStatus(link, warehouse);
      processed += 1;
    } catch (error) {
      logger.warn({ err: error, linkId: String(link._id) }, "ModernWMS poll failed");
    }
  }
  return processed;
}

async function syncInventory(companyId, warehouseId) {
  const warehouse = await getWarehouse(companyId, warehouseId);
  if (warehouse.fulfillmentMode !== "modernwms") {
    const { httpError } = require("../../utils/httpError");
    throw httpError(400, "Warehouse is not in ModernWMS fulfillment mode");
  }

  const client = clientFromWarehouse(warehouse);
  const rows = await client.stockList({ pageIndex: 1, pageSize: 500 });
  const bySku = new Map();

  for (const row of rows) {
    const sku = String(row.sku_code || row.bar_code || "").trim();
    if (!sku) continue;
    const available = Number(row.qty_available ?? row.qty ?? 0);
    bySku.set(sku, (bySku.get(sku) || 0) + available);
  }

  const routing = require("../routing");
  const items = [...bySku.entries()].map(([sku, quantityOnHand]) => ({
    sku,
    quantityOnHand,
  }));
  // Upsert is case-insensitive and updates existing linker rows instead of creating duplicates.
  const updated = await routing.upsertInventory(companyId, warehouseId, items);
  try {
    const inventorySync = require("../inventorySync");
    for (const item of items) {
      inventorySync.schedulePushSku({ companyId, warehouseId, sku: item.sku });
    }
  } catch (_) {
    /* non-fatal */
  }
  return { synced: updated.length, items: updated };
}

async function resolvePutawayLocation(client, preferredSku = null) {
  const warehouses = await client.listWarehouses();
  if (!warehouses?.length) {
    throw new Error("ModernWMS has no warehouse — create one before restocking returns");
  }
  const wh = warehouses[0];

  // Prefer the bin that already holds this SKU so we increase existing stock, not a new location.
  if (preferredSku) {
    try {
      const locRows = await client.locationStockList({ pageIndex: 1, pageSize: 500 });
      const want = String(preferredSku).trim().toUpperCase();
      const match = (locRows || []).find((row) => {
        const code = String(row.sku_code || row.bar_code || "").trim().toUpperCase();
        return code === want && Number(row.goods_location_id || 0) > 0;
      });
      if (match) {
        return {
          warehouse: wh,
          locationId: Number(match.goods_location_id),
          locationName: match.location_name || String(match.goods_location_id),
        };
      }
    } catch (error) {
      logger.warn({ err: error, sku: preferredSku }, "ModernWMS location stock lookup failed — using default bin");
    }
  }

  const areas = await client.listAreasByWarehouse(wh.id);
  if (!areas?.length) {
    throw new Error("ModernWMS warehouse has no area — create an area/bin before restocking");
  }
  const area = {
    id: Number(areas[0].value ?? areas[0].id),
    area_name: areas[0].label ?? areas[0].area_name ?? "MAIN",
  };
  const locations = await client.listLocationsByArea(area.id);
  if (!locations?.length) {
    throw new Error("ModernWMS area has no bin location — create one before restocking");
  }
  return {
    warehouse: wh,
    locationId: Number(locations[0].value ?? locations[0].id),
    locationName: locations[0].label ?? locations[0].location_name ?? "A-01-01",
  };
}

async function resolveGoodsOwner(client, goodsOwnerId) {
  const rows = await client.listGoodsOwners();
  const match = (rows || []).find((r) => Number(r.id) === Number(goodsOwnerId));
  if (!match) {
    throw new Error(`ModernWMS goods owner id=${goodsOwnerId} not found`);
  }
  return match;
}

async function resolveSkuForRestock(client, code) {
  const want = String(code || "").trim();
  if (!want) throw new Error("Missing SKU for ModernWMS restock");

  try {
    const sku = await client.getSkuByBarCode(want);
    if (sku && Number(sku.sku_id || sku.id || 0) > 0) return sku;
  } catch {
    /* try stock list fallback */
  }

  const rows = await client.stockList({ pageIndex: 1, pageSize: 500 });
  const upper = want.toUpperCase();
  const row = (rows || []).find((r) => {
    const skuCode = String(r.sku_code || "").trim().toUpperCase();
    const bar = String(r.bar_code || "").trim().toUpperCase();
    return skuCode === upper || bar === upper;
  });
  if (row && Number(row.sku_id || 0) > 0) {
    return {
      sku_id: row.sku_id,
      sku_code: row.sku_code || want,
      sku_name: row.sku_name || want,
      spu_id: row.spu_id || 0,
      spu_code: row.spu_code || row.sku_code || want,
      spu_name: row.spu_name || row.sku_name || want,
      bar_code: row.bar_code || want,
    };
  }

  throw new Error(`ModernWMS SKU not found for barcode/SKU ${want}`);
}

/**
 * Increase ModernWMS stock for returned SKUs via ASN confirm → unload → sort → putaway.
 * Puts away into the existing SKU location when possible so the same stock row increases.
 * items: [{ sku, quantity }]
 */
async function restockInventory({ warehouse, items, reference = "" }) {
  if (!warehouse || warehouse.fulfillmentMode !== "modernwms") {
    return { skipped: true, reason: "not_modernwms" };
  }

  const lines = (items || [])
    .map((item) => ({
      sku: String(item.sku || "").trim(),
      quantity: Math.max(0, Number(item.quantity) || 0),
    }))
    .filter((item) => item.sku && item.quantity > 0);

  if (!lines.length) {
    return { skipped: true, reason: "no_lines" };
  }

  const goodsOwnerId = warehouse.modernwms?.goodsOwnerId;
  if (!goodsOwnerId) {
    const { httpError } = require("../../utils/httpError");
    throw httpError(400, "Configure ModernWMS goods owner on the warehouse before restocking returns");
  }

  const client = clientFromWarehouse(warehouse);
  const goodsOwner = await resolveGoodsOwner(client, goodsOwnerId);
  const { locationId } = await resolvePutawayLocation(client, lines[0].sku);

  const beforeBySku = new Map();
  try {
    const beforeRows = await client.stockList({ pageIndex: 1, pageSize: 500 });
    for (const row of beforeRows || []) {
      const code = String(row.sku_code || row.bar_code || "").trim().toUpperCase();
      if (!code) continue;
      beforeBySku.set(code, (beforeBySku.get(code) || 0) + (Number(row.qty_available ?? row.qty) || 0));
    }
  } catch (error) {
    logger.warn({ err: error }, "ModernWMS stock snapshot before restock failed");
  }

  const detailList = [];
  for (const item of lines) {
    const sku = await resolveSkuForRestock(client, item.sku);
    const skuId = Number(sku.sku_id || sku.id || 0);
    if (!skuId) {
      throw new Error(`ModernWMS SKU not found for barcode/SKU ${item.sku}`);
    }
    detailList.push({
      spu_id: sku.spu_id || 0,
      spu_code: sku.spu_code || item.sku,
      spu_name: sku.spu_name || sku.sku_name || item.sku,
      sku_id: skuId,
      sku_code: sku.sku_code || item.sku,
      sku_name: sku.sku_name || item.sku,
      asn_qty: item.quantity,
      actual_qty: 0,
      is_valid: true,
    });
  }

  const batch = `RMA-${String(reference || Date.now()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24)}`;
  const nowIso = new Date().toISOString();
  const masterId = await client.createAsnMaster({
    asn_batch: batch,
    estimated_arrival_time: nowIso,
    goods_owner_id: goodsOwner.id,
    goods_owner_name: goodsOwner.goods_owner_name,
    detailList,
  });

  const master = await client.getAsnMaster(masterId);
  const asnLines = master.detailList || [];
  if (!asnLines.length) {
    throw new Error("ModernWMS ASN created but has no detail lines");
  }

  await client.confirmAsn(asnLines.map((line) => ({ id: line.id, arrival_time: nowIso })));
  await client.unloadAsn(
    asnLines.map((line) => ({
      id: line.id,
      unload_time: nowIso,
      unload_person: "wms-linker-return",
    }))
  );

  for (const line of asnLines) {
    const sortedQty = Number(line.asn_qty || line.sorted_qty || 0);
    await client.sortAsn([
      {
        asn_id: line.id,
        sorted_qty: sortedQty,
        is_auto_num: false,
        series_number: `${batch}-${line.sku_code || line.id}`,
      },
    ]);
  }
  await client.markAsnSorted(asnLines.map((line) => line.id));

  for (const line of asnLines) {
    const pending = await client.pendingPutaway(line.id);
    if (!pending?.length) {
      throw new Error(`ModernWMS ASN line ${line.id} has no pending putaway`);
    }
    const putQty = Number(pending[0].sorted_qty || line.asn_qty || 0);
    if (putQty <= 0) {
      throw new Error(`ModernWMS ASN line ${line.id} has putaway qty 0`);
    }
    // Prefer location that already has this SKU when available
    let putLocationId = locationId;
    try {
      const { locationId: skuLoc } = await resolvePutawayLocation(client, line.sku_code || line.bar_code);
      if (skuLoc) putLocationId = skuLoc;
    } catch {
      /* keep default */
    }
    await client.putawayAsn([
      {
        asn_id: line.id,
        goods_owner_id: goodsOwner.id,
        goods_location_id: putLocationId,
        putaway_qty: putQty,
        series_number: pending[0].series_number || "",
      },
    ]);
  }

  // Verify stock actually increased for each SKU
  try {
    const afterRows = await client.stockList({ pageIndex: 1, pageSize: 500 });
    const afterBySku = new Map();
    for (const row of afterRows || []) {
      const code = String(row.sku_code || row.bar_code || "").trim().toUpperCase();
      if (!code) continue;
      afterBySku.set(code, (afterBySku.get(code) || 0) + (Number(row.qty_available ?? row.qty) || 0));
    }
    for (const item of lines) {
      const code = item.sku.toUpperCase();
      const before = beforeBySku.get(code) || 0;
      const after = afterBySku.get(code) || 0;
      if (after < before + item.quantity) {
        logger.warn(
          { sku: item.sku, before, after, expectedDelta: item.quantity },
          "ModernWMS stock did not increase by full restock qty"
        );
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "ModernWMS stock verification after restock failed");
  }

  logger.info(
    {
      warehouseId: String(warehouse._id),
      asnMasterId: masterId,
      batch,
      locationId,
      skus: lines.map((l) => `${l.sku}x${l.quantity}`),
    },
    "ModernWMS return restock putaway complete"
  );

  return { skipped: false, asnMasterId: masterId, batch, items: lines };
}

async function getOrderModernwmsStatus(orderId) {
  const links = await ModernWmsLink.find({ orderId }).sort({ createdAt: 1 });
  return links.map((l) => ({
    ...l.toPublic(),
    statusLabel: mapper.dispatchStatusLabel(l.dispatchStatus),
    waitingOnOps: !l.closed && l.dispatchStatus < DELIVERED_STATUS,
  }));
}

async function cancelDispatchForOrder(orderId) {
  const links = await ModernWmsLink.find({ orderId, closed: { $ne: true } });
  const Warehouse = require("../companies/warehouseModel");

  for (const link of links) {
    if (link.dispatchNo) {
      try {
        const warehouse = await Warehouse.findById(link.warehouseId);
        if (warehouse?.fulfillmentMode === "modernwms") {
          const client = clientFromWarehouse(warehouse);
          const rows = await client.getDispatchByNo(link.dispatchNo);
          const status = rows?.length ? Math.max(...rows.map((r) => Number(r.dispatch_status || 0))) : 0;
          if (status <= 1) {
            await client.deleteDispatch(link.dispatchNo);
          }
        }
      } catch (error) {
        logger.warn({ err: error, orderId: String(orderId), dispatchNo: link.dispatchNo }, "ModernWMS cancel dispatch failed");
      }
    }
    link.closed = true;
    link.closedAt = new Date();
    await link.save();
  }
}

module.exports = {
  getModernwmsConfig,
  updateModernwmsConfig,
  testConnection,
  pushOrder,
  pollDispatchStatus,
  pollOpenLinks,
  syncInventory,
  restockInventory,
  getOrderModernwmsStatus,
  cancelDispatchForOrder,
  dispatchStatusLabel: mapper.dispatchStatusLabel,
  publicModernwmsConfig,
  registerInventoryWebhook,
  unregisterInventoryWebhook,
  DELIVERED_STATUS,
};
