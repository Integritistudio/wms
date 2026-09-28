// Offline regression tests against the real services with in-memory boundaries.
// No .env, network, or live database is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const pool = require("../src/modules/inventorySync/stockPool");
const root = path.join(__dirname, "../src/modules");
function load(file, mocks) {
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(path.join(root, file), "utf8")}\n})`, { filename: file })(
    (name) => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected dependency ${name}`); }, module, module.exports);
  return module.exports;
}
const query = (value) => ({ lean: async () => value, select() { return this; } });
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function fixture() {
  const rows = [
    { warehouseId: "w1", sku: "A", quantityOnHand: 5, quantityAvailable: 3 },
    { warehouseId: "w2", sku: "A", quantityOnHand: 9, quantityAvailable: 7 },
    { warehouseId: "foreign", sku: "A", quantityAvailable: 1000 },
  ];
  const writes = [];
  const shopX = { _id: "x", companyId: "company", warehouseIds: ["w1", "w2"], inventoryLocationGid: "location-x" };
  const shopY = { _id: "y", companyId: "company", warehouseIds: ["w2"], inventoryLocationGid: "location-y" };
  const mocks = {
    crypto: require("node:crypto"),
    "../shops/model": {}, "../shops": {}, "./productLinkModel": {},
    "../companies/warehouseModel": { find(filter) {
      assert.equal(filter.companyId, "company");
      return query(filter._id.$in.filter((id) => ["w1", "w2"].includes(id)).map((_id) => ({ _id })));
    } },
    "../routing/inventoryModel": { find(filter) {
      assert.equal(filter.companyId, "company");
      return query(rows.filter((row) => filter.warehouseId.$in.includes(row.warehouseId) && filter.sku.test(row.sku)));
    } },
    "./locationModel": { find: () => query([]) },
    "./shopifyInventory": { activateAndSet: async (args) => writes.push(args) },
    "../../utils/httpError": { httpError }, "./stockPool": pool,
  };
  return { rows, writes, shopX, shopY, mocks, service: load("inventorySync/storeService.js", mocks) };
}

test("two warehouses sum available stock and shared reservations update both stores", async () => {
  const f = fixture();
  const link = { sku: "a", inventoryItemId: "item" };
  await f.service.pushLink(f.shopX, link);
  await f.service.pushLink(f.shopY, link);
  assert.deepEqual(f.writes.map((w) => [w.locationGid, w.quantity]), [["location-x", 10], ["location-y", 7]]);
  f.rows[1].quantityAvailable -= 2; // WMS reserves an order from either store
  f.writes.length = 0;
  await f.service.pushLink(f.shopX, link);
  await f.service.pushLink(f.shopY, link);
  assert.deepEqual(f.writes.map((w) => w.quantity), [8, 5]);
});

test("disconnect, duplicate warehouse IDs, and missing SKUs cannot leave or duplicate stock", async () => {
  const f = fixture();
  f.shopX.warehouseIds = ["w1", "w1"];
  await f.service.pushLink(f.shopX, { sku: "A", inventoryItemId: "item" });
  f.shopX.warehouseIds = [];
  await f.service.pushLink(f.shopX, { sku: "A", inventoryItemId: "item" });
  f.shopX.warehouseIds = ["w1", "w2"];
  await f.service.pushLink(f.shopX, { sku: "MISSING", inventoryItemId: "item" });
  assert.deepEqual(f.writes.map((w) => w.quantity), [3, 0, 0]);
});

test("changing pooled location clears the previous WMS location", async () => {
  const f = fixture();
  f.shopX.retiredInventoryLocations = ["old-location"];
  await f.service.pushLink(f.shopX, { sku: "A", inventoryItemId: "item" });
  assert.deepEqual(f.writes.map((w) => [w.locationGid, w.quantity]), [["old-location", 0], ["location-x", 10]]);
});

test("legacy mappings sharing a location aggregate without counting a warehouse twice", () => {
  const targets = pool.locationPools({}, [
    { warehouseId: "w1", locationGid: "l" }, { warehouseId: "w2", locationGid: "l" }, { warehouseId: "w1", locationGid: "l" },
  ]);
  assert.deepEqual(targets.get("l"), ["w1", "w2"]);
  assert.equal(pool.sumAvailable([{ warehouseId: "w1", quantityAvailable: -3 }, { warehouseId: "w2", quantityAvailable: 7 }], targets.get("l")), 7);
});

test("Shopify failure propagates so the queue can retry", async () => {
  const f = fixture();
  f.mocks["./shopifyInventory"].activateAndSet = async () => { throw new Error("Shopify unavailable"); };
  await assert.rejects(f.service.pushLink(f.shopX, { sku: "A", inventoryItemId: "item" }), /Shopify unavailable/);
});

test("store configuration cannot access another tenant or accept foreign warehouses", async () => {
  const f = fixture();
  f.mocks["../shops/model"].findOne = async (filter) => { assert.equal(filter.companyId, "company"); return null; };
  await assert.rejects(f.service.configure("company", "foreign", { warehouseIds: ["w1"] }), { statusCode: 404 });
  let saved = false;
  f.mocks["../shops/model"].findOne = async () => ({ save: async () => { saved = true; } });
  f.mocks["../shops"].validateWarehouseIds = async () => { throw httpError(400, "foreign warehouse"); };
  await assert.rejects(f.service.configure("company", "x", { warehouseIds: ["foreign"] }), { statusCode: 400 });
  assert.equal(saved, false);
});

test("order warehouse eligibility respects an empty selection and blocks manual cross-store assignment", async () => {
  let ids = ["w2"];
  const service = load("shops/warehouses.js", {
    "./model": { findOne: () => query({ warehouseIds: ids }) },
    "../companies/warehouseModel": { find: (filter) => query(filter._id.$in.map((_id) => ({ _id }))) },
    "../../utils/httpError": { httpError },
  });
  await service.assertConnected("company", "y", "w2");
  await assert.rejects(service.assertConnected("company", "y", "w1"), { statusCode: 400 });
  ids = [];
  assert.equal((await service.allowedWarehouses("company", "y")).length, 0);
});

test("failed shared-stock reservation rolls back prior reservations without creating fake groups", async () => {
  const released = [];
  let created = 0;
  const plan = new Map();
  // Fail the second SKU in the same group, before any group is persisted.
  plan.set("w1", [{ sku: "A", allocate: 1 }, { sku: "B", allocate: 1 }]);
  let calls = 0;
  const service2 = load("fulfillment/allocate.js", {
    "../companies/warehouseModel": {}, "./groupModel": { create: async () => { created++; } },
    "./inventory": { reserve: async () => ++calls === 1 ? {} : null, release: async (r) => released.push(r) },
    "../routing": {}, "../routing/mapbox": {}, "../routing/inventoryModel": {},
  });
  await assert.rejects(service2.createGroupsFromPlan({ _id: "order" }, { _id: "x", companyId: "company", warehouseIds: ["w1"] }, { plan }), /Stock changed/);
  assert.equal(created, 0);
  assert.deepEqual(released.map((r) => r.sku), ["A"]);
});

test("warehouse update fans out through the outbound service to all connected stores", async () => {
  const f = fixture();
  const service = load("inventorySync/service.js", {
    "./productLinkModel": { findOne: async () => ({ sku: "A", inventoryItemId: "item" }) },
    "./locationModel": { find: () => query([]) },
    "./shopifyInventory": {}, "../shops": { isProcessable: () => true },
    "../shops/model": { find: async (filter) => {
      assert.equal(filter.companyId, "company");
      assert.equal(filter.$or[0].warehouseIds, "w2");
      return [f.shopX, f.shopY];
    } },
    "../companies/warehouseModel": {}, "../routing/inventoryModel": {},
    "../../utils/httpError": { httpError }, "../../config/logger": { warn() {} },
    "./storeService": f.service,
  });
  const result = await service.pushSkuToShopify({ companyId: "company", warehouseId: "w2", sku: "A" });
  assert.equal(result.pushed, 2);
  assert.deepEqual(f.writes.map((w) => w.quantity), [10, 7]);
});

test("queue group lease prevents a competing worker from writing the same stock pool", async () => {
  let invoked = false;
  const updates = [];
  const job = { _id: "job", groupId: "company", attempts: 1, topic: "inventory/push" };
  const worker = load("queue/worker.js", {
    "./model": { updateMany: async () => {}, distinct: async () => [], findOneAndUpdate: async () => job,
      updateOne: async (filter, update) => updates.push({ filter, update }) },
    "./leaseModel": { findOneAndUpdate: async () => { throw Object.assign(new Error("leased"), { code: 11000 }); } },
    "../../config/logger": { error() {} }, "../../db/connect": {}, crypto: require("node:crypto"),
  });
  await worker.processNext(async () => { invoked = true; });
  assert.equal(invoked, false);
  assert.equal(updates[0].update.$set.status, "pending");
  assert.equal(updates[0].update.$inc.attempts, -1);
});

test("pooled hold-all orders can fulfill from the combined stock of two connected warehouses", async () => {
  const warehouses = [{ _id: "w1", name: "One" }, { _id: "w2", name: "Two" }];
  const service = load("fulfillment/allocate.js", {
    "../companies/warehouseModel": {}, "./groupModel": {},
    "./inventory": { stockMapForWarehouse: async (id) => new Map([["A", id === "w1" ? 3 : 7]]) },
    "../routing": { getConfig: async () => ({ enabled: false, partialPolicy: "hold_all" }) },
    "../routing/mapbox": {},
    "../routing/inventoryModel": { find: () => query([{ sku: "A" }]), exists: async () => true },
    "../shops/warehouses": { allowedWarehouses: async () => warehouses },
  });
  const result = await service.planAllocation({ shopId: "x", lineItems: [{ id: "line", sku: "A", quantity: 10 }] }, "company", { sharedInventory: true });
  assert.equal(result.hold, false);
  assert.equal(result.plan.get("w1")[0].allocate, 3);
  assert.equal(result.plan.get("w2")[0].allocate, 7);
  assert.equal(result.lines[0].backorderedQty, 0);
});

test("queue recovers expired jobs, retries inventory failures, and releases the group lease", async () => {
  const updates = [];
  let recovered = false;
  let released = false;
  const worker = load("queue/worker.js", {
    "./model": { updateMany: async (filter) => { recovered = filter.status === "processing" && !!filter.lockedUntil.$lt; },
      distinct: async () => [], findOneAndUpdate: async () => ({ _id: "job", groupId: "company", attempts: 3, topic: "inventory/push" }),
      updateOne: async (filter, update) => updates.push({ filter, update }) },
    "./leaseModel": { findOneAndUpdate: async () => ({}), deleteOne: async () => { released = true; } },
    "../../config/logger": { error() {} }, "../../db/connect": {}, crypto: require("node:crypto"),
  });
  await worker.processNext(async () => { throw new Error("Shopify unavailable"); });
  assert.equal(recovered, true);
  assert.equal(released, true);
  assert.equal(updates[0].update.$set.status, "pending");
  assert.equal(updates[0].update.$set.lastError, "Shopify unavailable");
  assert.ok(updates[0].filter.lockOwner);
});
