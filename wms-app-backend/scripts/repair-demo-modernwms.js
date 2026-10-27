require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
async function main() {
  const { ModernWmsClient } = require("../src/modules/modernwms/client");
  const client = new ModernWmsClient({ baseUrl: process.env.MODERNWMS_DEFAULT_BASE_URL, username: process.env.MODERNWMS_USERNAME, password: process.env.MODERNWMS_PASSWORD });
  const connected = await client.testConnection();
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const Company = require("../src/modules/companies/model");
  const Warehouse = require("../src/modules/companies/warehouseModel");
  const Shop = require("../src/modules/shops/model");
  const Order = require("../src/modules/orders/model");
  const Group = require("../src/modules/fulfillment/groupModel");
  const { encrypt } = require("../src/utils/secret");
  const company = await Company.findOne({ email: "admin@tricode-demo.example" });
  if (!company) throw new Error("Expected demo company not found");
  const warehouses = await Warehouse.find({ companyId: company._id, code: { $in: ["DEMO-KHI", "DEMO-LHE"] } });
  const owners = await client.listGoodsOwners();
  for (const warehouse of warehouses) {
    warehouse.modernwms.baseUrl = process.env.MODERNWMS_DEFAULT_BASE_URL;
    warehouse.modernwms.username = process.env.MODERNWMS_USERNAME;
    warehouse.modernwms.passwordEncrypted = encrypt(process.env.MODERNWMS_PASSWORD);
    warehouse.modernwms.tenantId = connected.tenantId;
    warehouse.modernwms.defaultCustomerId = 1;
    if (owners.length === 1) warehouse.modernwms.goodsOwnerId = owners[0].id;
    await warehouse.save();
  }
  const skuCode = "QA-SKU-A";
  let sku;
  try { sku = await client.getSkuByBarCode(skuCode); } catch (error) {
    if (!/not found|不存在|does not exist/i.test(error.message)) throw error;
  }
  if (!Number(sku?.sku_id || sku?.id)) {
    const categories = await client.request("/category/all");
    const category = categories.find(c => c.category_name === "General") || categories[0];
    if (!category) throw new Error("ModernWMS category required");
    await client.request("/spu", { method: "POST", body: {
      spu_code: skuCode, spu_name: skuCode, category_id: category.id, category_name: category.category_name,
      spu_description: "QA Shopify integration product", is_valid: true,
      detailList: [{ sku_code: skuCode, sku_name: skuCode, bar_code: skuCode, unit: "ea", price: 0, cost: 0 }],
    } });
    sku = await client.getSkuByBarCode(skuCode);
  }
  console.log("ModernWMS SKU", skuCode, Number(sku.sku_id || sku.id));
  const shop = await Shop.findOne({ companyId: company._id, shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  if (!shop) throw new Error("Expected Shopify store not found");
  const { shopifyGraphql } = require("../src/modules/shops/service");
  const variantId = "67723876729082";
  const result = await shopifyGraphql(shop, "query($id:ID!){productVariant(id:$id){id sku inventoryItem{id}}}", { id: `gid://shopify/ProductVariant/${variantId}` });
  const variant = result.productVariant;
  if (!variant) throw new Error("Shopify variant not found");
  if (variant.sku && variant.sku !== skuCode) throw new Error("Variant SKU changed; refusing to overwrite");
  if (!variant.sku) {
    const updated = await shopifyGraphql(shop, "mutation($id:ID!,$input:InventoryItemInput!){inventoryItemUpdate(id:$id,input:$input){inventoryItem{id sku} userErrors{message}}}", { id: variant.inventoryItem.id, input: { sku: skuCode } });
    if (updated.inventoryItemUpdate.userErrors.length) throw new Error(updated.inventoryItemUpdate.userErrors.map(e => e.message).join("; "));
    console.log("Shopify variant SKU saved", skuCode);
  }
  const orders = await Order.find({ shopId: shop._id, "lineItems.variantId": variantId });
  let repaired = 0;
  for (const order of orders) {
    const ids = [];
    for (const line of order.lineItems) {
      if (String(line.variantId) === variantId && !String(line.sku || "").trim()) { line.sku = skuCode; ids.push(String(line.id)); }
    }
    if (!ids.length) continue;
    order.markModified("lineItems"); await order.save();
    const groups = await Group.find({ orderId: order._id, status: { $nin: ["cancelled", "shipped"] } });
    for (const group of groups) {
      for (const line of group.lines) if (ids.includes(line.orderLineId) && !String(line.sku || "").trim()) line.sku = skuCode;
      await group.save();
    }
    repaired++;
  }
  const modernwms = require("../src/modules/modernwms/service");
  for (const warehouse of warehouses) {
    const stock = await modernwms.syncInventory(company._id, warehouse._id);
    // A newly-created catalog SKU has no stock row until it is received.
    if (!stock.items.some(row => row.sku === skuCode)) {
      await require("../src/modules/routing").upsertInventory(company._id, warehouse._id, [{ sku: skuCode, quantityOnHand: 0 }]);
    }
    console.log("Inventory imported", warehouse.name, stock.synced);
  }
  console.log("Shopify catalog", await require("../src/modules/inventorySync/service").syncCatalogFromShopify(company._id, shop._id));
  console.log("Orders repaired", repaired);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
