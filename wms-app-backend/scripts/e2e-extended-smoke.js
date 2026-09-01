/**
 * Extended E2E smoke: split orders, routing rules, inventory thresholds, partial ship.
 * Uses memory Mongo + MOCK_MODERNWMS.
 *
 *   node scripts/e2e-extended-smoke.js
 */
const path = require("path");
const fs = require("fs");

process.env.MOCK_MODERNWMS = process.env.MOCK_MODERNWMS ?? "1";
process.env.FILE_STORAGE_DIR = path.join(__dirname, "..", ".tmp-e2e-smoke-storage");
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

function mwmsWarehouse(companyId, name, code, encrypt) {
  return {
    companyId,
    name,
    code,
    address: `${code} Way`,
    fulfillmentMode: "modernwms",
    modernwms: {
      baseUrl: process.env.MODERNWMS_BASE_URL || "http://127.0.0.1:20011",
      username: "admin",
      passwordEncrypted: encrypt("1"),
      defaultCustomerId: 1,
      tenantId: 1,
    },
  };
}

async function main() {
  console.log("\n=== E2E extended smoke (split · rules · inventory) ===\n");

  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongoose = require("mongoose");
  const { resetMockState, setMockDispatchDelivered } = require("../src/modules/modernwms/client");

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
  const RoutingRule = require("../src/modules/routing/ruleModel");
  const Order = require("../src/modules/orders/model");
  const FailedOrder = require("../src/modules/orders/failedOrderModel");
  const FulfillmentGroup = require("../src/modules/fulfillment/groupModel");
  const Shipment = require("../src/modules/fulfillment/shipmentModel");
  const ModernWmsLink = require("../src/modules/modernwms/model");
  const Notification = require("../src/modules/notifications/model");
  const orders = require("../src/modules/orders/service");
  const fulfillment = require("../src/modules/fulfillment");
  const modernwms = require("../src/modules/modernwms");
  const { encrypt } = require("../src/utils/secret");

  const stamp = Date.now();
  const company = await Company.create({
    name: `E2E Co ${stamp}`,
    email: `e2e-${stamp}@example.com`,
    password: "hash",
    status: "active",
  });

  const shop = await Shop.create({
    companyId: company._id,
    shopDomain: `e2e-${stamp}.myshopify.com`,
    accessToken: "shpat_test",
    enabled: true,
    installed: true,
    mappingKey: "generic",
  });

  const whA = await Warehouse.create(mwmsWarehouse(company._id, "MWMS East", "MWE", encrypt));
  const whB = await Warehouse.create(mwmsWarehouse(company._id, "MWMS West", "MWW", encrypt));

  await WarehouseInventory.create([
    { companyId: company._id, warehouseId: whA._id, sku: "SKU-A", quantityOnHand: 100, quantityAvailable: 100, reserved: 0 },
    { companyId: company._id, warehouseId: whA._id, sku: "RT-RULE-SKU", quantityOnHand: 50, quantityAvailable: 50, reserved: 0 },
    { companyId: company._id, warehouseId: whB._id, sku: "SKU-B", quantityOnHand: 100, quantityAvailable: 100, reserved: 0 },
    { companyId: company._id, warehouseId: whB._id, sku: "SKU-A", quantityOnHand: 5, quantityAvailable: 5, reserved: 0 },
    { companyId: company._id, warehouseId: whB._id, sku: "RT-RULE-SKU", quantityOnHand: 50, quantityAvailable: 50, reserved: 0 },
  ]);

  await whA.updateOne({ minStockThreshold: 10 });

  await RoutingConfig.findOneAndUpdate(
    { companyId: company._id },
    {
      companyId: company._id,
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      partialPolicy: "ship_available",
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    },
    { upsert: true }
  );

  function sampleOrder(extra = {}) {
    return {
      shopId: shop._id,
      companyId: company._id,
      shopifyOrderId: `gid://shopify/Order/${stamp}-${Math.random().toString(36).slice(2, 7)}`,
      orderNumber: `#E2E-${Math.floor(Math.random() * 90000)}`,
      customerName: "E2E Tester",
      source: "demo",
      status: "received",
      shippingAddress: { zip: "10001", city: "New York", province: "NY", country: "US" },
      lineItems: [{ id: "1", sku: "SKU-A", title: "A", quantity: 1, shippedQty: 0, status: "open" }],
      ...extra,
    };
  }

  await runCase("A · Normal single-line MWMS closed loop", async () => {
    const order = await Order.create(sampleOrder());
    const result = await fulfillment.allocateOrder(order, shop, { forceWarehouseId: whA._id });
    assert(result.groups?.length === 1, "one group");
    const link = await ModernWmsLink.findOne({ groupId: result.groups[0]._id });
    assert(link?.dispatchNo, "dispatch pushed");
    setMockDispatchDelivered(link.dispatchNo, { waybillNo: "NORM-1", carrier: "UPS" });
    await modernwms.pollDispatchStatus(link, whA);
    const fresh = await Order.findById(order._id);
    assert(fresh.status === "945_received" || fresh.status === "fulfilled", fresh.status);
    ok("A · Normal single-line MWMS closed loop", fresh.status);
  });

  await runCase("B · Normal multi-line same warehouse", async () => {
    const order = await Order.create(sampleOrder({
      lineItems: [
        { id: "1", sku: "SKU-A", title: "A", quantity: 2, shippedQty: 0, status: "open" },
        { id: "2", sku: "RT-RULE-SKU", title: "Rule SKU", quantity: 1, shippedQty: 0, status: "open" },
      ],
    }));
    const result = await fulfillment.allocateOrder(order, shop, { forceWarehouseId: whA._id });
    assert(result.groups?.length === 1, `groups ${result.groups?.length}`);
    const links = await ModernWmsLink.find({ orderId: order._id });
    assert(links.length === 1 && links[0].dispatchNo, "one dispatch");
    ok("B · Normal multi-line same warehouse", links[0].dispatchNo);
  });

  let splitOrder;
  let splitGroups = [];
  let splitLinks = [];

  await runCase("C · Split order across two MWMS warehouses", async () => {
    splitOrder = await Order.create(sampleOrder({
      lineItems: [
        { id: "1", sku: "SKU-A", title: "A", quantity: 1, shippedQty: 0, status: "open" },
        { id: "2", sku: "SKU-B", title: "B", quantity: 1, shippedQty: 0, status: "open" },
      ],
    }));
    const result = await fulfillment.allocateOrder(splitOrder, shop);
    assert(result.groups?.length === 2, `expected 2 groups, got ${result.groups?.length}`);
    splitGroups = result.groups;
    splitLinks = await ModernWmsLink.find({ orderId: splitOrder._id }).sort({ createdAt: 1 });
    assert(splitLinks.length === 2, `expected 2 MWMS links, got ${splitLinks.length}`);
    const whIds = new Set(splitGroups.map((g) => String(g.warehouseId)));
    assert(whIds.has(String(whA._id)) && whIds.has(String(whB._id)), "both warehouses used");
    ok("C · Split order across two MWMS warehouses", `${splitLinks[0].dispatchNo} + ${splitLinks[1].dispatchNo}`);
  });

  await runCase("D · Split closed loop — partial then fulfilled", async () => {
    assert(splitLinks.length === 2, "need split from case C");
    for (let i = 0; i < splitLinks.length; i += 1) {
      const group = splitGroups[i];
      const wh = String(group.warehouseId) === String(whA._id) ? whA : whB;
      setMockDispatchDelivered(splitLinks[i].dispatchNo, { waybillNo: `SPLIT-${i + 1}`, carrier: i === 0 ? "UPS" : "FedEx" });
      await modernwms.pollDispatchStatus(splitLinks[i], wh);
      if (i === 0) {
        const mid = await Order.findById(splitOrder._id);
        assert(
          mid.status === "partially_fulfilled" || mid.status === "945_received" || mid.status === "fulfilled",
          `after first ship: ${mid.status}`
        );
      }
    }
    const order = await Order.findById(splitOrder._id);
    assert(order.status === "945_received" || order.status === "fulfilled", order.status);
    const shipments = await Shipment.find({ orderId: splitOrder._id });
    assert(shipments.length === 2, `shipments ${shipments.length}`);
    ok("D · Split closed loop — partial then fulfilled", order.status);
  });

  await runCase("E · Routing rule → target warehouse (MWMS push)", async () => {
    await RoutingRule.deleteMany({ companyId: company._id });
    await RoutingRule.create({
      companyId: company._id,
      name: "Rule SKU → West",
      enabled: true,
      priority: 1,
      warehouseId: whB._id,
      conditionLogic: "and",
      requireAllItemsInStock: false,
      conditions: [{ field: "sku_equals", operator: "equals", value: "RT-RULE-SKU" }],
    });
    const ingested = await orders.ingestFromWebhook(
      shop,
      {
        id: `rule-${stamp}`,
        order_number: `#RULE-${stamp}`,
        email: "buyer@example.com",
        shipping_address: { city: "Austin", province_code: "TX", zip: "78701", country_code: "US" },
        line_items: [{ id: "1", sku: "RT-RULE-SKU", title: "Rule", quantity: 1 }],
      },
      { source: "demo", skipProcessable: true, forceAllocate: false }
    );
    const fresh = await Order.findById(ingested.order.id);
    assert(/rule/i.test(fresh.routingReason || ""), fresh.routingReason);
    const link = await ModernWmsLink.findOne({ orderId: fresh._id });
    assert(link?.dispatchNo, "MWMS push on rule warehouse");
    assert(String(link.warehouseId) === String(whB._id), "routed to West");
    ok("E · Routing rule → target warehouse (MWMS push)", fresh.routingReason);
  });

  await runCase("F · minStockThreshold spills SKU-A to West", async () => {
    await WarehouseInventory.updateOne(
      { companyId: company._id, warehouseId: whA._id, sku: "SKU-A" },
      { quantityOnHand: 10, quantityAvailable: 10, reserved: 0 }
    );
    const order = await Order.create(sampleOrder({
      lineItems: [{ id: "1", sku: "SKU-A", title: "A", quantity: 8, shippedQty: 0, status: "open" }],
    }));
    const result = await fulfillment.allocateOrder(order, shop);
    assert(result.groups?.length >= 1, "allocated");
    const groupB = result.groups.find((g) => String(g.warehouseId) === String(whB._id));
    assert(groupB, "West warehouse picked up qty (East at/below threshold)");
    ok("F · minStockThreshold spills SKU-A to West", `${result.groups.length} group(s)`);
  });

  await runCase("G · hold_all → on_hold (no MWMS push)", async () => {
    await RoutingConfig.updateOne({ companyId: company._id }, { partialPolicy: "hold_all" });
    const order = await Order.create(sampleOrder({
      lineItems: [
        { id: "1", sku: "SKU-A", title: "A", quantity: 1, shippedQty: 0, status: "open" },
        { id: "2", sku: "SKU-B", title: "B", quantity: 1, shippedQty: 0, status: "open" },
      ],
    }));
    const result = await fulfillment.allocateOrder(order, shop);
    assert(result.hold, "should hold");
    assert(result.groups?.length === 0, "no groups");
    const link = await ModernWmsLink.findOne({ orderId: order._id });
    assert(!link, "no MWMS push");
    await RoutingConfig.updateOne({ companyId: company._id }, { partialPolicy: "ship_available" });
    ok("G · hold_all → on_hold (no MWMS push)");
  });

  await runCase("H · ROUTING_NO_MATCH → error + notification", async () => {
    await RoutingConfig.updateOne(
      { companyId: company._id },
      { defaultWarehouseId: null, fallbackWarehouseId: null }
    );
    await RoutingRule.deleteMany({ companyId: company._id });
    const ingested = await orders.ingestFromWebhook(
      shop,
      {
        id: `nomatch-${stamp}`,
        order_number: `#NOMATCH-${stamp}`,
        shipping_address: { zip: "99999", country_code: "US" },
        line_items: [{ id: "1", sku: "SKU-A", title: "A", quantity: 1 }],
      },
      { source: "demo", skipProcessable: true, forceAllocate: false }
    );
    const fresh = await Order.findById(ingested.order.id);
    assert(fresh.status === "error", fresh.status);
    const dlq = await FailedOrder.findOne({ orderId: fresh._id });
    assert(dlq?.reason === "ROUTING_NO_MATCH", dlq?.reason);
    const notif = await Notification.findOne({ companyId: company._id, type: "order_error" });
    assert(notif, "notification created");
    await RoutingConfig.updateOne(
      { companyId: company._id },
      { defaultWarehouseId: whA._id, fallbackWarehouseId: whB._id }
    );
    ok("H · ROUTING_NO_MATCH → error + notification");
  });

  await runCase("I · Suggest → override warehouse → MWMS push", async () => {
    await RoutingConfig.updateOne({ companyId: company._id }, { autoAssignOnReceive: false });
    const simulated = await orders.simulate(shop._id, {
      lineItems: [{ sku: "SKU-B", title: "B", quantity: 1 }],
      shippingAddress: { zip: "90210", city: "LA", province: "CA", country: "US" },
      respectRouting: true,
      forceAllocate: false,
    });
    const orderId = simulated.order?.id || simulated.order?._id;
    assert(orderId, "simulated");
    await orders.assignWarehouse(orderId, whB._id);
    const link = await ModernWmsLink.findOne({ orderId });
    assert(link?.dispatchNo, "push after manual assign");
    await RoutingConfig.updateOne({ companyId: company._id }, { autoAssignOnReceive: true });
    ok("I · Suggest → override warehouse → MWMS push", link.dispatchNo);
  });

  await runCase("J · Inventory sync from ModernWMS mock", async () => {
    const result = await modernwms.syncInventory(company._id, whA._id);
    assert(result.synced >= 1, `synced ${result.synced}`);
    const rows = await WarehouseInventory.find({ companyId: company._id, warehouseId: whA._id, sku: "SKU-A" });
    assert(rows.length >= 1, "SKU-A row exists");
    ok("J · Inventory sync from ModernWMS mock", `${result.synced} SKU(s)`);
  });

  await mongoose.disconnect();
  await mongod.stop();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== E2E extended: ${passed}/${results.length} passed, ${failed} failed ===\n`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
