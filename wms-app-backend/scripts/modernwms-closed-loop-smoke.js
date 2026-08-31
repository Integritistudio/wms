/**
 * ModernWMS closed-loop smoke (memory Mongo + MOCK_MODERNWMS).
 *
 *   node scripts/modernwms-closed-loop-smoke.js
 *
 * Live ModernWMS (optional):
 *   MOCK_MODERNWMS=0 MODERNWMS_BASE_URL=http://127.0.0.1:20011 node scripts/modernwms-closed-loop-smoke.js
 */
const path = require("path");
const fs = require("fs");

process.env.MOCK_MODERNWMS = process.env.MOCK_MODERNWMS ?? "1";
process.env.FILE_STORAGE_DIR = path.join(__dirname, "..", ".tmp-mwms-smoke-storage");
process.env.R2_ACCOUNT_ID = "";
process.env.R2_ACCESS_KEY_ID = "";
process.env.R2_SECRET_ACCESS_KEY = "";
process.env.R2_BUCKET = "";
process.env.LOG_LEVEL = "error";

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
process.env.R2_ACCOUNT_ID = "";
process.env.R2_ACCESS_KEY_ID = "";
process.env.R2_SECRET_ACCESS_KEY = "";
process.env.R2_BUCKET = "";

const results = [];
function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ name, pass: false, detail: String(detail || "") });
  console.error(`  FAIL  ${name} — ${detail}`);
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function runCase(name, fn) {
  console.log(`\n— ${name} —`);
  try {
    await fn();
    if (!results.some((r) => r.name === name)) ok(name);
  } catch (err) {
    fail(name, err.stack || err.message || err);
  }
}

async function main() {
  console.log("\n=== ModernWMS closed-loop smoke ===\n");
  console.log(`MOCK_MODERNWMS=${process.env.MOCK_MODERNWMS}`);

  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongoose = require("mongoose");
  const { resetMockState, setMockDispatchDelivered, ModernWmsClient } = require("../src/modules/modernwms/client");

  resetMockState();

  const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongod.getUri(), { bufferCommands: false });
  fs.mkdirSync(process.env.FILE_STORAGE_DIR, { recursive: true });

  const connectMod = require("../src/db/connect");
  connectMod.isConnected = () => mongoose.connection.readyState === 1;

  const Company = require("../src/modules/companies/model");
  const Warehouse = require("../src/modules/companies/warehouseModel");
  const Shop = require("../src/modules/shops/model");
  const WarehouseInventory = require("../src/modules/routing/inventoryModel");
  const RoutingConfig = require("../src/modules/routing/configModel");
  const Order = require("../src/modules/orders/model");
  const FailedOrder = require("../src/modules/orders/failedOrderModel");
  const FulfillmentGroup = require("../src/modules/fulfillment/groupModel");
  const Shipment = require("../src/modules/fulfillment/shipmentModel");
  const ModernWmsLink = require("../src/modules/modernwms/model");
  const orders = require("../src/modules/orders/service");
  const fulfillment = require("../src/modules/fulfillment");
  const modernwms = require("../src/modules/modernwms");
  const { encrypt } = require("../src/utils/secret");

  const stamp = Date.now();
  const company = await Company.create({
    name: `MWMS Co ${stamp}`,
    email: `mwms-${stamp}@example.com`,
    password: "test-password-hash",
    status: "active",
  });

  const shop = await Shop.create({
    companyId: company._id,
    shopDomain: `mwms-${stamp}.myshopify.com`,
    accessToken: "shpat_test",
    enabled: true,
    installed: true,
    mappingKey: "generic",
  });

  const whModern = await Warehouse.create({
    companyId: company._id,
    name: "MWMS Primary",
    code: "MW1",
    address: "1 MWMS Way",
    fulfillmentMode: "modernwms",
    modernwms: {
      baseUrl: process.env.MODERNWMS_BASE_URL || "http://127.0.0.1:20011",
      username: "admin",
      passwordEncrypted: encrypt("1"),
      defaultCustomerId: 1,
      tenantId: 1,
    },
  });

  const whSftp = await Warehouse.create({
    companyId: company._id,
    name: "Legacy SFTP",
    code: "SF1",
    address: "2 EDI Lane",
    fulfillmentMode: "sftp_edi",
  });

  await WarehouseInventory.create([
    { companyId: company._id, warehouseId: whModern._id, sku: "SKU-A", quantityOnHand: 100, quantityAvailable: 100, reserved: 0 },
    { companyId: company._id, warehouseId: whSftp._id, sku: "SKU-A", quantityOnHand: 50, quantityAvailable: 50, reserved: 0 },
  ]);

  await RoutingConfig.findOneAndUpdate(
    { companyId: company._id },
    {
      companyId: company._id,
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: whModern._id,
    },
    { upsert: true }
  );

  function sampleOrder(extra = {}) {
    return {
      shopId: shop._id,
      companyId: company._id,
      shopifyOrderId: `gid://shopify/Order/${stamp}-${Math.random().toString(36).slice(2, 7)}`,
      orderNumber: `#${stamp}-${Math.floor(Math.random() * 9000)}`,
      customerName: "Smoke Tester",
      source: "demo",
      status: "received",
      shippingAddress: { zip: "10001", city: "New York", province: "NY", country: "US" },
      lineItems: [{ id: "1", sku: "SKU-A", title: "Product A", quantity: 1, shippedQty: 0, status: "open" }],
      ...extra,
    };
  }

  await runCase("1 · ModernWMS login + health", async () => {
    const client = new ModernWmsClient({
      baseUrl: whModern.modernwms.baseUrl,
      username: "admin",
      password: "1",
    });
    const result = await client.testConnection();
    assert(result.ok, "expected ok");
    assert(result.tenantId, "expected tenant");
    ok("1 · ModernWMS login + health", `tenant ${result.tenantId}`);
  });

  await runCase("2 · Master sync fixture (SKU lookup)", async () => {
    const client = new ModernWmsClient({
      baseUrl: whModern.modernwms.baseUrl,
      username: "admin",
      password: "1",
    });
    const sku = await client.getSkuByBarCode("SKU-A");
    assert(sku?.id || sku?.sku_id, "SKU-A resolved");
    ok("2 · Master sync fixture (SKU lookup)", `sku_id ${sku.id || sku.sku_id}`);
  });

  await runCase("3 · Warehouse modernwms mode config saved", async () => {
    const cfg = await modernwms.updateModernwmsConfig(company._id, whModern._id, {
      fulfillmentMode: "modernwms",
      baseUrl: whModern.modernwms.baseUrl,
      username: "admin",
      defaultCustomerId: 1,
    });
    assert(cfg.fulfillmentMode === "modernwms", "mode modernwms");
    ok("3 · Warehouse modernwms mode config saved");
  });

  let pushedOrder;
  let pushedGroup;
  let pushedLink;

  await runCase("4 · Order allocate → push dispatch", async () => {
    const order = await Order.create(sampleOrder());
    const result = await fulfillment.allocateOrder(order, shop, { forceWarehouseId: whModern._id });
    assert(result.groups?.length === 1, "one group");
    pushedOrder = result.order;
    pushedGroup = result.groups[0];
    const link = await ModernWmsLink.findOne({ groupId: pushedGroup._id });
    assert(link?.dispatchNo, `dispatchNo missing: ${link?.pushError}`);
    pushedLink = link;
    ok("4 · Order allocate → push dispatch", link.dispatchNo);
  });

  await runCase("5 · Poll before delivery keeps 940_ready", async () => {
    await modernwms.pollDispatchStatus(pushedLink, whModern);
    const fresh = await Order.findById(pushedOrder._id);
    assert(fresh.status === "940_ready", `status ${fresh.status}`);
    const shipments = await Shipment.find({ orderId: fresh._id });
    assert(shipments.length === 0, "no shipment yet");
    ok("5 · Poll before delivery keeps 940_ready");
  });

  await runCase("6 · Simulate MWMS delivery → poller status 6", async () => {
    setMockDispatchDelivered(pushedLink.dispatchNo, { waybillNo: "TRACK-MWMS-1", carrier: "UPS" });
    await modernwms.pollDispatchStatus(pushedLink, whModern);
    const link = await ModernWmsLink.findById(pushedLink._id);
    assert(link.dispatchStatus >= 6, `status ${link.dispatchStatus}`);
    ok("6 · Simulate MWMS delivery → poller status 6");
  });

  await runCase("7 · Auto shipGroup closes loop (945_received)", async () => {
    const order = await Order.findById(pushedOrder._id);
    assert(order.status === "945_received" || order.status === "fulfilled", `status ${order.status}`);
    const shipment = await Shipment.findOne({ fulfillmentGroupId: pushedGroup._id });
    assert(shipment, "shipment created");
    const link = await ModernWmsLink.findById(pushedLink._id);
    assert(link.closed, "link closed");
    ok("7 · Auto shipGroup closes loop (945_received)", order.status);
  });

  await runCase("8 · Legacy SFTP warehouse unchanged", async () => {
    const order = await Order.create(sampleOrder());
    const result = await fulfillment.allocateOrder(order, shop, { forceWarehouseId: whSftp._id });
    assert(result.groups?.length === 1, "group created");
    assert(result.groups[0].sftpStatus === "skipped", "no SFTP connection → skipped");
    const link = await ModernWmsLink.findOne({ orderId: order._id });
    assert(!link, "no MWMS link for SFTP warehouse");
    ok("8 · Legacy SFTP warehouse unchanged");
  });

  await runCase("9 · Suggest → accept → MWMS push", async () => {
    await RoutingConfig.updateOne({ companyId: company._id }, { autoAssignOnReceive: false });
    const simulated = await orders.simulate(shop, {
      lineItems: [{ sku: "SKU-A", title: "Product A", quantity: 1 }],
      shippingAddress: { zip: "10001", city: "New York", province: "NY", country: "US" },
      respectRouting: true,
      forceAllocate: false,
    });
    const orderId = simulated.order?.id || simulated.order?._id;
    assert(orderId, "simulated order");
    await orders.assignWarehouse(orderId, whModern._id);
    const link = await ModernWmsLink.findOne({ orderId });
    assert(link?.dispatchNo, "MWMS dispatch after accept");
    await RoutingConfig.updateOne({ companyId: company._id }, { autoAssignOnReceive: true });
    ok("9 · Suggest → accept → MWMS push", link.dispatchNo);
  });

  await runCase("10 · PRODUCT_NOT_FOUND → no MWMS push", async () => {
    const order = await Order.create(sampleOrder({ lineItems: [{ id: "9", sku: "MISSING-SKU", title: "X", quantity: 1 }] }));
    const result = await fulfillment.allocateOrder(order, shop, { forceWarehouseId: whModern._id });
    assert(result.failed, "allocation failed");
    const dlq = await FailedOrder.findOne({ orderId: order._id });
    assert(dlq?.reason === "PRODUCT_NOT_FOUND", dlq?.reason);
    const link = await ModernWmsLink.findOne({ orderId: order._id });
    assert(!link, "no MWMS link");
    ok("10 · PRODUCT_NOT_FOUND → no MWMS push");
  });

  await runCase("11 · Cancel order clears MWMS dispatch link", async () => {
    const order = await Order.create(sampleOrder());
    const result = await fulfillment.allocateOrder(order, shop, { forceWarehouseId: whModern._id });
    const link = await ModernWmsLink.findOne({ groupId: result.groups[0]._id });
    assert(link?.dispatchNo, "dispatch exists");
    order.status = "cancelled";
    await order.save();
    await fulfillment.cancelOrderFulfillment(order, shop);
    const closed = await ModernWmsLink.findById(link._id);
    assert(closed.closed, "link closed on cancel");
    ok("11 · Cancel order clears MWMS dispatch link");
  });

  await runCase("12 · Idempotent re-poll (no duplicate shipment)", async () => {
    const shipmentsBefore = await Shipment.countDocuments({ fulfillmentGroupId: pushedGroup._id });
    const link = await ModernWmsLink.findById(pushedLink._id);
    await modernwms.pollDispatchStatus(link, whModern);
    await modernwms.pollOpenLinks();
    const shipmentsAfter = await Shipment.countDocuments({ fulfillmentGroupId: pushedGroup._id });
    assert(shipmentsBefore === shipmentsAfter, `${shipmentsBefore} vs ${shipmentsAfter}`);
    ok("12 · Idempotent re-poll (no duplicate shipment)", `${shipmentsAfter} shipment(s)`);
  });

  await mongoose.disconnect();
  await mongod.stop();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${passed}/${results.length} passed, ${failed} failed ===\n`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
