/**
 * In-process routing matrix smoke (MongoMemoryServer).
 * Does not need Atlas or the HTTP server.
 *
 *   node scripts/routing-settings-unit-smoke.js
 */
const path = require("path");
const fs = require("fs");

// Force local file storage so allocate doesn't need R2
process.env.FILE_STORAGE_DIR = path.join(__dirname, "..", ".tmp-routing-smoke-storage");
process.env.R2_ACCOUNT_ID = "";
process.env.R2_ACCESS_KEY_ID = "";
process.env.R2_SECRET_ACCESS_KEY = "";
process.env.R2_BUCKET = "";
process.env.LOG_LEVEL = "error";

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
// Re-clear R2 after dotenv
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
  } catch (err) {
    fail(name, err.stack || err.message || err);
  }
}

async function main() {
  console.log("\n=== Routing settings UNIT smoke (memory mongo) ===\n");

  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongoose = require("mongoose");

  const mongod = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 120000,
    },
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri, { bufferCommands: false });
  ok("memory mongo connected");

  fs.mkdirSync(process.env.FILE_STORAGE_DIR, { recursive: true });

  // Patch isConnected used by workers/hooks if anything checks it
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
  const Notification = require("../src/modules/notifications/model");
  const orders = require("../src/modules/orders/service");
  const routing = require("../src/modules/routing");

  const stamp = Date.now();
  const company = await Company.create({
    name: `Routing Unit ${stamp}`,
    email: `routing-unit-${stamp}@example.com`,
  });
  const shop = await Shop.create({
    shopDomain: `routing-unit-${stamp}.myshopify.com`,
    companyId: company._id,
    enabled: true,
    installed: true,
  });
  const whA = await Warehouse.create({
    companyId: company._id,
    name: "Austin Primary",
    code: "AUS",
    address: "Austin, TX 78701",
    zipPrefixes: ["787"],
    routingPriority: 10,
    isActive: true,
  });
  const whB = await Warehouse.create({
    companyId: company._id,
    name: "Dallas Fallback",
    code: "DAL",
    address: "Dallas, TX 75201",
    zipPrefixes: ["752"],
    routingPriority: 50,
    isActive: true,
  });
  ok("fixtures", `A=${whA._id} B=${whB._id}`);

  const skus = ["RT-SMOKE-1", "RT-SMOKE-2", "RT-RULE-SKU"];
  for (const wh of [whA, whB]) {
    for (const sku of skus) {
      await WarehouseInventory.create({
        companyId: company._id,
        warehouseId: wh._id,
        sku,
        quantityOnHand: 50,
        quantityAvailable: 50,
        reserved: 0,
      });
    }
  }
  ok("inventory seeded");

  async function setConfig(patch) {
    await RoutingConfig.findOneAndUpdate(
      { companyId: company._id },
      { $set: { companyId: company._id, ...patch } },
      { upsert: true }
    );
  }

  async function clearRules() {
    await RoutingRule.deleteMany({ companyId: company._id });
  }

  async function ingest(payload = {}) {
    const id = `demo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const result = await orders.ingestFromWebhook(
      shop,
      {
        id,
        order_number: payload.orderNumber || `ORD-${id.slice(-6)}`,
        email: "buyer@example.com",
        shipping_address: {
          first_name: "Demo",
          last_name: "Buyer",
          address1: "123 Main",
          city: payload.city || "Austin",
          province_code: payload.provinceCode || "TX",
          zip: payload.zip || "78701",
          country_code: "US",
        },
        line_items: (payload.lineItems || [{ sku: "RT-SMOKE-1", title: "Item", quantity: 1 }]).map(
          (li, idx) => ({
            id: `${id}-${idx}`,
            sku: li.sku,
            title: li.title || li.sku,
            quantity: li.quantity || 1,
          })
        ),
      },
      { source: "demo", skipProcessable: true, forceAllocate: false }
    );
    return result.order;
  }

  await runCase("engine: rules → default → fallback → null", async () => {
    const { routeOrder } = require("../src/modules/routing/engine");
    const order = {
      lineItems: [{ sku: "X", quantity: 1 }],
      shippingAddress: { zip: "78701", countryCode: "US", provinceCode: "TX" },
      payload: {},
    };
    const warehouses = [whA.toObject(), whB.toObject()];

    let r = await routeOrder(order, company._id, [], { enabled: false }, warehouses);
    assert(r === null, "disabled → null");

    r = await routeOrder(
      order,
      company._id,
      [],
      { enabled: true, defaultWarehouseId: whA._id, fallbackWarehouseId: whB._id, addressMode: "off" },
      warehouses
    );
    assert(String(r.warehouseId) === String(whA._id), "default");
    assert(r.reason === "Default warehouse", r.reason);

    r = await routeOrder(
      order,
      company._id,
      [],
      { enabled: true, defaultWarehouseId: null, fallbackWarehouseId: whB._id, addressMode: "off" },
      warehouses
    );
    assert(String(r.warehouseId) === String(whB._id), "fallback");
    assert(/Fallback/i.test(r.reason), r.reason);

    r = await routeOrder(
      order,
      company._id,
      [],
      { enabled: true, defaultWarehouseId: null, fallbackWarehouseId: null, addressMode: "off" },
      warehouses
    );
    assert(r === null, "no match → null");

    const rules = [
      {
        _id: new mongoose.Types.ObjectId(),
        name: "SKU rule",
        enabled: true,
        priority: 1,
        warehouseId: whB._id,
        conditionLogic: "and",
        requireAllItemsInStock: false,
        conditions: [{ field: "sku_equals", operator: "equals", value: "RT-RULE-SKU" }],
      },
    ];
    r = await routeOrder(
      { ...order, lineItems: [{ sku: "RT-RULE-SKU", quantity: 1 }] },
      company._id,
      rules,
      { enabled: true, defaultWarehouseId: whA._id, fallbackWarehouseId: whB._id, addressMode: "off" },
      warehouses
    );
    assert(String(r.warehouseId) === String(whB._id), "rule wins");
    assert(/Matched rule/i.test(r.reason), r.reason);

    r = await routeOrder(
      { ...order, shippingAddress: { zip: "75201", countryCode: "US", provinceCode: "TX" } },
      company._id,
      [],
      { enabled: true, defaultWarehouseId: null, fallbackWarehouseId: whA._id, addressMode: "zip_prefix" },
      warehouses
    );
    assert(String(r.warehouseId) === String(whB._id), "zip → Dallas");
    assert(/ZIP/i.test(r.reason), r.reason);

    // ZIP miss should NOT invent priority pick — fall to fallback
    r = await routeOrder(
      { ...order, shippingAddress: { zip: "10001", countryCode: "US", provinceCode: "NY" } },
      company._id,
      [],
      { enabled: true, defaultWarehouseId: null, fallbackWarehouseId: whA._id, addressMode: "zip_prefix" },
      warehouses
    );
    assert(String(r.warehouseId) === String(whA._id), "zip miss → fallback");
    assert(/Fallback/i.test(r.reason), r.reason);

    ok("routeOrder matrix");
  });

  await runCase("Routing OFF → blank until assign", async () => {
    await clearRules();
    await setConfig({
      enabled: false,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    });
    const order = await ingest({ orderNumber: `OFF-${stamp}` });
    assert(!order.warehouseId, `warehouse ${order.warehouseId}`);
    assert(!order.suggestedWarehouseId, `suggested ${order.suggestedWarehouseId}`);
    assert(order.status === "received", `status ${order.status}`);
    ok("blank on routing off");

    const assigned = await orders.assignWarehouse(order.id, String(whA._id));
    assert(String(assigned.warehouseId) === String(whA._id), "assigned");
    assert(assigned.status === "940_ready", `status ${assigned.status}`);
    ok("manual assign commits");
  });

  await runCase("Routing ON + auto-assign ON → commit", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    });
    const order = await ingest({ orderNumber: `AUTO-${stamp}`, lineItems: [{ sku: "RT-SMOKE-1", quantity: 1 }] });
    assert(String(order.warehouseId) === String(whA._id), `WH ${order.warehouseId}`);
    assert(!order.suggestedWarehouseId, "no leftover suggestion");
    assert(order.status === "940_ready", `status ${order.status}`);
    ok("auto-assign committed", order.routingReason);
  });

  await runCase("Routing ON + auto-assign OFF → suggest → Accept", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: false,
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    });
    const order = await ingest({ orderNumber: `SUG-${stamp}`, lineItems: [{ sku: "RT-SMOKE-2", quantity: 1 }] });
    assert(!order.warehouseId, "unassigned");
    assert(String(order.suggestedWarehouseId) === String(whA._id), `suggest ${order.suggestedWarehouseId}`);
    assert(order.status === "received", `status ${order.status}`);
    assert(order.sftpStatus === "skipped", `sftp ${order.sftpStatus}`);
    ok("suggestion only");

    // create() is fire-and-forget on ingest — wait briefly then scan
    await new Promise((r) => setTimeout(r, 150));
    const notifs = await Notification.find({ companyId: company._id }).lean();
    const related = notifs.filter((n) => String(n.meta?.orderId || "") === String(order.id));
    assert(related.length >= 1, `notification expected, got ${notifs.length} company notifs`);
    ok("notification on suggest");

    const accepted = await orders.assignWarehouse(order.id, order.suggestedWarehouseId);
    assert(String(accepted.warehouseId) === String(whA._id), "accepted WH");
    assert(!accepted.suggestedWarehouseId, "cleared");
    assert(accepted.status === "940_ready", `status ${accepted.status}`);
    ok("Accept → 940_ready");
  });

  await runCase("Rule match → Dallas", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    });
    await RoutingRule.create({
      companyId: company._id,
      name: "SKU → Dallas",
      enabled: true,
      priority: 1,
      warehouseId: whB._id,
      conditionLogic: "and",
      requireAllItemsInStock: false,
      conditions: [{ field: "sku_equals", operator: "equals", value: "RT-RULE-SKU" }],
    });
    const order = await ingest({
      orderNumber: `RULE-${stamp}`,
      lineItems: [{ sku: "RT-RULE-SKU", quantity: 1 }],
    });
    assert(String(order.warehouseId) === String(whB._id), `WH ${order.warehouseId}`);
    assert(/rule/i.test(order.routingReason || ""), order.routingReason);
    ok("rule matched", order.routingReason);
  });

  await runCase("Fallback only", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: null,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    });
    const order = await ingest({ orderNumber: `FB-${stamp}` });
    assert(String(order.warehouseId) === String(whB._id), `WH ${order.warehouseId}`);
    assert(/fallback/i.test(order.routingReason || ""), order.routingReason);
    ok("fallback", order.routingReason);
  });

  await runCase("No match → error + ROUTING_NO_MATCH", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: null,
      fallbackWarehouseId: null,
      addressMode: "off",
    });
    const order = await ingest({ orderNumber: `NOM-${stamp}` });
    assert(order.status === "error", `status ${order.status}`);
    assert(!order.warehouseId, "no WH");
    assert(!order.suggestedWarehouseId, "no suggest");

    const dlq = await FailedOrder.findOne({ orderId: order.id }).lean();
    assert(dlq, "DLQ missing");
    assert(dlq.reason === "ROUTING_NO_MATCH", `reason ${dlq.reason}`);
    ok("ROUTING_NO_MATCH DLQ");

    const notifs = await Notification.find({
      "meta.orderId": order.id,
      type: "order_error",
    }).lean();
    assert(notifs.length >= 1, "error notification");
    ok("error notification");
  });

  await runCase("ZIP suggest (auto-assign off)", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: false,
      defaultWarehouseId: null,
      fallbackWarehouseId: whA._id,
      addressMode: "zip_prefix",
    });
    const order = await ingest({
      orderNumber: `ZIP-${stamp}`,
      zip: "75201",
      city: "Dallas",
      lineItems: [{ sku: "RT-SMOKE-1", quantity: 1 }],
    });
    assert(!order.warehouseId, "not committed");
    assert(String(order.suggestedWarehouseId) === String(whB._id), `suggest ${order.suggestedWarehouseId}`);
    ok("ZIP suggest Dallas", order.routingReason);
  });

  await runCase("Unknown SKU → PRODUCT_NOT_FOUND", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    });
    const order = await ingest({
      orderNumber: `PNF-${stamp}`,
      lineItems: [{ sku: "DOES-NOT-EXIST", quantity: 1 }],
    });
    assert(order.status === "error", `status ${order.status}`);
    const dlq = await FailedOrder.findOne({ orderId: order.id }).lean();
    assert(dlq, "DLQ missing");
    assert(dlq.reason === "PRODUCT_NOT_FOUND", `reason ${dlq.reason}`);
    ok("PRODUCT_NOT_FOUND");
  });

  await runCase("Override suggestion with other WH", async () => {
    await clearRules();
    await setConfig({
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: false,
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "off",
    });
    const order = await ingest({ orderNumber: `PICK-${stamp}` });
    assert(String(order.suggestedWarehouseId) === String(whA._id), "suggest A");
    const picked = await orders.assignWarehouse(order.id, String(whB._id));
    assert(String(picked.warehouseId) === String(whB._id), "picked B");
    assert(!picked.suggestedWarehouseId, "cleared");
    ok("override suggestion");
  });

  await runCase("getConfig reflects toggles", async () => {
    await setConfig({
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: true,
      defaultWarehouseId: whA._id,
      fallbackWarehouseId: whB._id,
      addressMode: "zip_prefix",
    });
    const cfg = await routing.getConfig(company._id);
    assert(cfg.enabled === true, "enabled");
    assert(cfg.autoAssignOnReceive === false, "autoAssign");
    assert(cfg.autoDeliverSftp === true, "sftp");
    assert(cfg.addressMode === "zip_prefix", "addressMode");
    ok("getConfig");
  });

  const passed = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;
  console.log(`\n=== Summary: ${passed} passed, ${failedCount} failed ===\n`);

  await mongoose.disconnect();
  await mongod.stop();
  try {
    fs.rmSync(process.env.FILE_STORAGE_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (failedCount) process.exit(1);
}

main().catch((err) => {
  console.error("\n=== FATAL ===\n", err);
  process.exit(1);
});
