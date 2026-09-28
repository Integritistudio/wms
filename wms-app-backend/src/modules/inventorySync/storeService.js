const crypto = require("crypto");
const Shop = require("../shops/model");
const shops = require("../shops");
const Warehouse = require("../companies/warehouseModel");
const Inventory = require("../routing/inventoryModel");
const Maps = require("./locationModel");
const Links = require("./productLinkModel");
const shopify = require("./shopifyInventory");
const { httpError } = require("../../utils/httpError");
const { sumAvailable, locationPools } = require("./stockPool");

async function owned(companyId, shopId) {
  const shop = await Shop.findOne({ _id: shopId, companyId });
  if (!shop) throw httpError(404, "Store not found");
  return shop;
}

async function enqueueStore(shop) {
  const stored = await require("../events").persist({
    webhookId: `store-sync:${crypto.randomUUID()}`, topic: "inventory/sync_initial",
    shopDomain: shop.shopDomain, payload: { shopId: String(shop._id) }, rawBody: "",
  });
  await require("../queue").enqueue({ groupId: `inventory-company:${shop.companyId}`, topic: "inventory/sync_initial", eventId: stored.event._id, storeId: shop._id });
}

async function configure(companyId, shopId, { warehouseIds, locationGid } = {}) {
  const shop = await owned(companyId, shopId);
  const ids = await shops.validateWarehouseIds(companyId, warehouseIds);
  if (locationGid !== undefined && locationGid !== shop.inventoryLocationGid) {
    if (!shops.isProcessable(shop)) throw httpError(400, "Install the app before choosing a Shopify location");
    const locations = await shopify.listLocations(shop);
    if (!locations.some((l) => l.id === locationGid && l.isActive)) throw httpError(400, "Select an active location from this store");
    if (shop.inventoryLocationGid) shop.retiredInventoryLocations.addToSet(shop.inventoryLocationGid);
    shop.inventoryLocationGid = locationGid;
  }
  shop.warehouseIds = ids;
  shop.warehouseId = ids[0] || null; // compatibility for older displays only
  shop.inventorySyncPending = true;
  shop.inventorySyncError = "";
  await shop.save();
  // The pending flag survives a queue outage; the periodic repair also schedules it.
  if (shops.isProcessable(shop)) await enqueueStore(shop);
  return shop.toPublic();
}

async function targetsForSku(shop, sku) {
  const maps = await Maps.find({ companyId: shop.companyId, shopId: shop._id }).lean();
  const pools = locationPools(shop, maps);
  const ids = [...new Set([...pools.values()].flat())];
  const active = await Warehouse.find({ companyId: shop.companyId, _id: { $in: ids }, isActive: { $ne: false } }).select("_id").lean();
  const activeIds = active.map((w) => String(w._id));
  const rows = await Inventory.find({ companyId: shop.companyId, warehouseId: { $in: activeIds },
    sku: new RegExp(`^${String(sku).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).lean();
  return [...pools].map(([locationGid, warehouseIds]) => ({ locationGid, quantity: sumAvailable(rows, warehouseIds) }));
}

async function pushLink(shop, link) {
  if (Array.isArray(shop.warehouseIds) && !shop.inventoryLocationGid) throw new Error("Choose the store's Shopify inventory location");
  const targets = await targetsForSku(shop, link.sku);
  for (const target of targets) {
    await shopify.activateAndSet({ shop, inventoryItemId: link.inventoryItemId, ...target });
  }
  return targets.length;
}

async function initialize(shopId) {
  const shop = await shops.getById(shopId);
  if (!shops.isProcessable(shop)) return { skipped: "store disconnected" };
  const revision = shop.updatedAt;
  try {
    if (!Array.isArray(shop.warehouseIds)) {
      const maps = await Maps.find({ companyId: shop.companyId, shopId }).lean();
      shop.warehouseIds = [...new Set([...maps.map((m) => String(m.warehouseId)), ...(shop.warehouseId ? [String(shop.warehouseId)] : [])])];
    }
    if (!shop.inventoryLocationGid) {
      const locations = (await shopify.listLocations(shop)).filter((l) => l.isActive && l.fulfillsOnlineOrders);
      if (locations.length !== 1) throw new Error("Choose a Shopify inventory location in the store settings");
      shop.inventoryLocationGid = locations[0].id;
    }
    // Do not overwrite a warehouse selection saved during the Shopify request.
    const saved = await Shop.updateOne({ _id: shop._id, updatedAt: revision }, { $set: {
      warehouseIds: shop.warehouseIds, inventoryLocationGid: shop.inventoryLocationGid,
    } });
    if (!saved.matchedCount) throw new Error("Store settings changed; retrying with current settings");
    await require("./service").syncCatalogFromShopify(shop.companyId, shop._id);
    // Missing WMS SKUs publish zero instead of leaving independent Shopify stock.
    await Links.updateMany({ companyId: shop.companyId, shopId: shop._id }, { $set: { syncEnabled: true } });
    const links = await Links.find({ companyId: shop.companyId, shopId: shop._id, inventoryItemId: { $ne: "" } }).lean();
    let pushed = 0;
    for (const link of links) pushed += await pushLink(shop, link);
    await Shop.updateOne({ _id: shop._id, warehouseIds: shop.warehouseIds, inventoryLocationGid: shop.inventoryLocationGid }, {
      $set: { inventorySyncPending: false, inventorySyncError: "", inventorySyncedAt: new Date() },
    });
    return { pushed, skus: links.length };
  } catch (error) {
    await Shop.updateOne({ _id: shop._id }, { $set: { inventorySyncPending: true, inventorySyncError: error.message } });
    throw error;
  }
}

let timer;
let stopped = true;
function start() {
  if (!stopped) return;
  stopped = false;
  const tick = async () => {
    try {
      if (require("../../db/connect").isConnected()) {
        const stores = await Shop.find({ installed: true, enabled: true, warehouseIds: { $exists: true } });
        const Job = require("../queue/model");
        for (const shop of stores) {
          // Refresh totals periodically as a fallback for missed events and failed outbound jobs.
          if (!shop.inventorySyncPending && Date.now() - new Date(shop.inventorySyncedAt || 0).getTime() < 300000) continue;
          if (await Job.exists({ storeId: shop._id, status: { $in: ["pending", "processing"] } })) continue;
          await enqueueStore(shop);
        }
      }
    } catch (error) {
      require("../../config/logger").warn({ err: error }, "Store inventory repair scheduling failed");
    } finally {
      if (!stopped) { timer = setTimeout(tick, 60000); timer.unref(); }
    }
  };
  void tick();
}
function stop() { stopped = true; clearTimeout(timer); }
module.exports = { owned, configure, enqueueStore, targetsForSku, pushLink, initialize, start, stop };
