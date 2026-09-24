const ProductLink = require("./productLinkModel");
const WarehouseShopifyLocation = require("./locationModel");
const shopifyInventory = require("./shopifyInventory");
const shops = require("../shops");
const Warehouse = require("../companies/warehouseModel");
const WarehouseInventory = require("../routing/inventoryModel");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");

function normalizeSku(value) {
  return String(value || "").trim();
}

async function assertCompanyWarehouse(companyId, warehouseId) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) throw httpError(404, "Warehouse not found");
  return warehouse;
}

async function assertCompanyShop(companyId, shopId) {
  const shop = await shops.getById(shopId);
  if (!shop || String(shop.companyId) !== String(companyId)) {
    throw httpError(404, "Shop not found for this company");
  }
  if (!shop.installed || !shop.enabled) {
    throw httpError(400, "Shop must be installed and enabled");
  }
  return shop;
}

async function listProductLinks(companyId, { shopId, sku } = {}) {
  const filter = { companyId };
  if (shopId) filter.shopId = shopId;
  if (sku) filter.sku = new RegExp(`^${normalizeSku(sku).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const rows = await ProductLink.find(filter).sort({ sku: 1 }).lean();
  return rows.map((row) => ({
    id: String(row._id),
    companyId: String(row.companyId),
    shopId: String(row.shopId),
    sku: row.sku,
    variantId: row.variantId || "",
    inventoryItemId: row.inventoryItemId || "",
    productTitle: row.productTitle || "",
    syncEnabled: Boolean(row.syncEnabled),
    continueSelling: Boolean(row.continueSelling),
    updatedAt: row.updatedAt,
  }));
}

async function updateProductLink(companyId, linkId, patch = {}) {
  const link = await ProductLink.findOne({ _id: linkId, companyId });
  if (!link) throw httpError(404, "Product link not found");

  if (patch.syncEnabled !== undefined) {
    link.syncEnabled = Boolean(patch.syncEnabled);
  }
  if (patch.continueSelling !== undefined) {
    link.continueSelling = Boolean(patch.continueSelling);
    if (link.variantId) {
      try {
        const shop = await shops.getById(link.shopId);
        await shopifyInventory.setContinueSelling({
          shop,
          variantId: link.variantId,
          productId: link.productId,
          continueSelling: link.continueSelling,
        });
      } catch (error) {
        logger.warn({ err: error, linkId: String(link._id) }, "Failed to update Shopify inventoryPolicy");
        throw httpError(400, error.message || "Failed to update continue-selling on Shopify");
      }
    }
  }
  await link.save();
  return link.toPublic();
}

/**
 * Pull Shopify catalog for a shop; upsert ProductLink rows by SKU.
 * Does not enable sync by default (opt-in).
 */
async function syncCatalogFromShopify(companyId, shopId) {
  const shop = await assertCompanyShop(companyId, shopId);
  const variants = await shopifyInventory.fetchAllVariants(shop);
  let upserted = 0;
  let matchedInventory = 0;

  const inventorySkus = new Set(
    (
      await WarehouseInventory.find({ companyId })
        .select("sku")
        .lean()
    ).map((r) => normalizeSku(r.sku).toUpperCase())
  );

  for (const v of variants) {
    const sku = normalizeSku(v.sku);
    if (!sku) continue;
    const existing = await ProductLink.findOne({ shopId: shop._id, sku });
    const continueSelling = v.inventoryPolicy === "CONTINUE";
    if (existing) {
      existing.variantId = v.variantId;
      existing.inventoryItemId = v.inventoryItemId;
      existing.productTitle = v.productTitle;
      existing.productId = v.productId || existing.productId || "";
      existing.continueSelling = continueSelling;
      await existing.save();
    } else {
      await ProductLink.create({
        companyId,
        shopId: shop._id,
        sku,
        variantId: v.variantId,
        inventoryItemId: v.inventoryItemId,
        productTitle: v.productTitle,
        productId: v.productId || "",
        syncEnabled: false,
        continueSelling,
      });
    }
    upserted += 1;
    if (inventorySkus.has(sku.toUpperCase())) matchedInventory += 1;
  }

  return { upserted, matchedInventory, shopDomain: shop.shopDomain };
}

async function listLocationMaps(companyId, warehouseId) {
  await assertCompanyWarehouse(companyId, warehouseId);
  const rows = await WarehouseShopifyLocation.find({ companyId, warehouseId }).lean();
  return rows.map((row) => ({
    id: String(row._id),
    companyId: String(row.companyId),
    warehouseId: String(row.warehouseId),
    shopId: String(row.shopId),
    locationGid: row.locationGid,
    locationName: row.locationName || "",
    updatedAt: row.updatedAt,
  }));
}

async function listShopifyLocations(companyId, shopId) {
  const shop = await assertCompanyShop(companyId, shopId);
  const nodes = await shopifyInventory.listLocations(shop);
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    isActive: n.isActive,
    fulfillsOnlineOrders: n.fulfillsOnlineOrders,
  }));
}

async function setLocationMap(companyId, warehouseId, { shopId, locationGid, locationName }) {
  await assertCompanyWarehouse(companyId, warehouseId);
  const shop = await assertCompanyShop(companyId, shopId);
  const gid = String(locationGid || "").trim();
  if (!gid) throw httpError(400, "locationGid is required");

  const row = await WarehouseShopifyLocation.findOneAndUpdate(
    { warehouseId, shopId: shop._id },
    {
      $set: {
        companyId,
        warehouseId,
        shopId: shop._id,
        locationGid: gid,
        locationName: String(locationName || "").trim(),
      },
    },
    { upsert: true, new: true }
  );
  return {
    id: String(row._id),
    companyId: String(row.companyId),
    warehouseId: String(row.warehouseId),
    shopId: String(row.shopId),
    locationGid: row.locationGid,
    locationName: row.locationName || "",
    updatedAt: row.updatedAt,
  };
}

async function deleteLocationMap(companyId, warehouseId, shopId) {
  await assertCompanyWarehouse(companyId, warehouseId);
  await WarehouseShopifyLocation.deleteOne({ companyId, warehouseId, shopId });
  return { deleted: true };
}

/**
 * Push available qty for one SKU at a warehouse to all mapped shops with syncEnabled.
 */
async function pushSkuToShopify({ companyId, warehouseId, sku }) {
  const skuKey = normalizeSku(sku);
  if (!skuKey) return { pushed: 0, skipped: "no sku" };

  const inv = await WarehouseInventory.findOne({
    warehouseId,
    sku: new RegExp(`^${skuKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).lean();

  const available = inv
    ? Math.max(0, Number(inv.quantityAvailable ?? inv.quantityOnHand ?? 0) || 0)
    : 0;

  const maps = await WarehouseShopifyLocation.find({ companyId, warehouseId }).lean();
  if (!maps.length) {
    return { pushed: 0, skipped: "no location map" };
  }

  let pushed = 0;
  const errors = [];

  for (const map of maps) {
    const link = await ProductLink.findOne({
      companyId,
      shopId: map.shopId,
      sku: new RegExp(`^${skuKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      syncEnabled: true,
    });
    if (!link || !link.inventoryItemId) continue;

    try {
      const shop = await shops.getById(map.shopId);
      if (!shops.isProcessable(shop)) continue;

      await shopifyInventory.activateAndSet({
        shop,
        inventoryItemId: link.inventoryItemId,
        locationGid: map.locationGid,
        quantity: available,
      });
      pushed += 1;
    } catch (error) {
      logger.warn(
        { err: error, sku: skuKey, shopId: String(map.shopId), warehouseId: String(warehouseId) },
        "Shopify inventory push failed"
      );
      errors.push(error.message || String(error));
    }
  }

  return { pushed, available, errors };
}

/**
 * Non-blocking wrapper used after inventory upserts.
 */
function schedulePushSku(args) {
  setImmediate(() => {
    pushSkuToShopify(args).catch((error) => {
      logger.warn({ err: error, ...args }, "schedulePushSku failed");
    });
  });
}

async function pushWarehouseToShopify(companyId, warehouseId) {
  await assertCompanyWarehouse(companyId, warehouseId);
  const links = await ProductLink.find({ companyId, syncEnabled: true }).select("sku shopId").lean();
  const maps = await WarehouseShopifyLocation.find({ companyId, warehouseId }).lean();
  if (!maps.length) return { pushed: 0, skus: 0 };

  const shopIds = new Set(maps.map((m) => String(m.shopId)));
  const skus = [
    ...new Set(
      links.filter((l) => shopIds.has(String(l.shopId))).map((l) => normalizeSku(l.sku)).filter(Boolean)
    ),
  ];

  let pushed = 0;
  for (const sku of skus) {
    const result = await pushSkuToShopify({ companyId, warehouseId, sku });
    pushed += result.pushed || 0;
  }
  return { pushed, skus: skus.length };
}

module.exports = {
  listProductLinks,
  updateProductLink,
  syncCatalogFromShopify,
  listLocationMaps,
  listShopifyLocations,
  setLocationMap,
  deleteLocationMap,
  pushSkuToShopify,
  schedulePushSku,
  pushWarehouseToShopify,
};
