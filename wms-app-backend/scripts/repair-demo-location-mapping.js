require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const Shop = require("../src/modules/shops/model");
  const Warehouse = require("../src/modules/companies/warehouseModel");
  const Maps = require("../src/modules/inventorySync/locationModel");
  const Links = require("../src/modules/inventorySync/productLinkModel");
  const Inventory = require("../src/modules/routing/inventoryModel");
  const Job = require("../src/modules/queue/model");
  const shop = await Shop.findOne({ shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  if (!shop) throw new Error("Expected store not found");
  const companyId = shop.companyId;
  const warehouses = await Warehouse.find({ companyId, name: { $in: ["NY Warehouse", "NJ Warehouse"] } });
  const locations = await require("../src/modules/inventorySync/shopifyInventory").listLocations(shop);
  const mapping = [["NY Warehouse", "Shop location"], ["NJ Warehouse", "My Custom Location"]].map(([warehouseName, locationName]) => {
    const warehouse = warehouses.find(w => w.name === warehouseName);
    const location = locations.find(l => l.name === locationName && l.isActive);
    if (!warehouse || !location) throw new Error(`Missing warehouse or Shopify location: ${warehouseName} / ${locationName}`);
    return { warehouse, location };
  });
  const backup = { shopId: shop._id, warehouseIds: shop.warehouseIds, warehouseId: shop.warehouseId,
    inventoryLocationGid: shop.inventoryLocationGid, retiredInventoryLocations: shop.retiredInventoryLocations,
    maps: await Maps.find({ shopId: shop._id }).lean() };
  const backupDir = path.resolve(__dirname, "../../outputs/shopify-import");
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(path.join(backupDir, `mapping-backup-${Date.now()}.json`), JSON.stringify(backup, null, 2));
  for (const { warehouse, location } of mapping) {
    await Maps.findOneAndUpdate({ warehouseId: warehouse._id, shopId: shop._id }, { $set: {
      companyId, warehouseId: warehouse._id, shopId: shop._id, locationGid: location.id, locationName: location.name,
    } }, { upsert: true, runValidators: true });
  }
  async function useIndividualLocations() {
    await Shop.updateOne({ _id: shop._id }, { $unset: { warehouseIds: "" }, $set: {
      inventoryLocationGid: "", retiredInventoryLocations: [], inventorySyncPending: false,
      inventorySyncError: "", updatedAt: new Date(),
    } });
    // Supersede queued pooled initialization tasks; stock-change jobs remain active.
    await Job.updateMany({ storeId: shop._id, topic: "inventory/sync_initial", status: "pending" }, { $set: {
      status: "failed", lastError: "Superseded by explicit NY/NJ per-location mapping", lockedUntil: null, lockOwner: "",
    } });
  }
  await useIndividualLocations();
  for (let n = 0; n < 30; n++) {
    if (!await Job.exists({ storeId: shop._id, topic: "inventory/sync_initial", status: "processing" })) break;
    if (n === 29) throw new Error("An old pooled sync is still processing; retry after it completes");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await useIndividualLocations();
  const service = require("../src/modules/inventorySync/service");
  console.log("Catalog refresh", await service.syncCatalogFromShopify(companyId, shop._id));
  const stock = await Inventory.find({ companyId }).select("sku").lean();
  const skus = [...new Set(stock.map(row => row.sku))];
  await Links.updateMany({ companyId, shopId: shop._id, sku: { $in: skus } }, { $set: { syncEnabled: true } });
  const current = await Shop.findById(shop._id);
  const links = await Links.find({ companyId, shopId: shop._id, sku: { $in: skus }, syncEnabled: true });
  for (const link of links) {
    const targets = await require("../src/modules/inventorySync/storeService").targetsForSku(current, link.sku);
    await require("../src/modules/inventorySync/storeService").pushLink(current, link);
    console.log("Published", link.sku, JSON.stringify(targets));
  }
  await Shop.updateOne({ _id: shop._id, warehouseIds: { $exists: false } }, { $set: { inventorySyncedAt: new Date(), inventorySyncError: "", inventorySyncPending: false } });
  const missing = await Links.find({ companyId, shopId: shop._id, syncEnabled: true, sku: { $nin: skus } }).select("sku").lean();
  console.log("Synced Shopify SKUs with no WMS inventory", missing.map(l => l.sku));
  console.log("Mapping verified", JSON.stringify(await Maps.find({ shopId: shop._id }).select("locationName warehouseId").lean()));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
