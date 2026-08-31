const ModernWmsLink = require("./model");
const { clientFromWarehouse } = require("./client");
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
  return getModernwmsConfig(companyId, warehouseId);
}

async function testConnection(companyId, warehouseId) {
  const warehouse = await getWarehouse(companyId, warehouseId);
  const client = clientFromWarehouse(warehouse);
  const result = await client.testConnection();
  if (result.tenantId && !warehouse.modernwms?.tenantId) {
    warehouse.modernwms = warehouse.modernwms || {};
    warehouse.modernwms.tenantId = result.tenantId;
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
  const updated = await routing.upsertInventory(companyId, warehouseId, items);
  return { synced: updated.length, items: updated };
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
  getOrderModernwmsStatus,
  cancelDispatchForOrder,
  dispatchStatusLabel: mapper.dispatchStatusLabel,
  publicModernwmsConfig,
  DELIVERED_STATUS,
};
