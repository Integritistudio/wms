const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { buildApp } = require("../src/app");
const { migrate } = require("../scripts/migrate-from-backend");
const { createMapbox } = require("../src/mapbox");
const { secret, tenantA, tenantB, warehouseA, warehouseB, warehouseC, order, warehouses, inventory, signed, loadModule, adapterPath } = require("./helpers");

test("routing API, persistence, isolation, backend integration and migration", { timeout: 180000 }, async (t) => {
  const mongod = await MongoMemoryServer.create();
  t.after(() => mongod.stop());
  await mongoose.connect(mongod.getUri("routing"));
  t.after(() => mongoose.disconnect());
  const Rule = require("../src/ruleModel");
  const Config = require("../src/configModel");
  await Promise.all([Rule.init(), Config.init()]);
  const app = buildApp({ secret, Rule, Config });
  t.after(() => app.close());
  const snapshotA = { warehouses, inventory };
  const snapshotB = { warehouses: [{ _id: warehouseC, companyId: tenantB, name: "Tenant B", isActive: true }],
    inventory: [{ companyId: tenantB, warehouseId: warehouseC, sku: "SKU-1", quantityAvailable: 0, quantityOnHand: 100 }] };
  const call = (method, path, tenant, json) => app.inject(signed(method, `/v1/routing${path}`, tenant, json));
  const create = (tenant, data, snapshot) => call("POST", "/rules", tenant, { data, snapshot });
  let ruleA, ruleB;

  await t.test("unsigned, altered-tenant, altered-body and stale requests fail", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/v1/routing/config" })).statusCode, 401);
    const tampered = signed("GET", "/v1/routing/config", tenantA);
    tampered.headers["x-routing-tenant"] = tenantB;
    assert.equal((await app.inject(tampered)).statusCode, 401);
    const stale = signed("GET", "/v1/routing/config", tenantA, undefined, { timestamp: String(Date.now() - 61000) });
    assert.equal((await app.inject(stale)).statusCode, 401);
    const changedBody = signed("PUT", "/v1/routing/config", tenantA, { data: {}, snapshot: snapshotA });
    changedBody.payload = changedBody.payload.replace('"data":{}', '"data":{"enabled":true}');
    assert.equal((await app.inject(changedBody)).statusCode, 401);
  });

  await t.test("config defaults and every existing toggle survive round trip per tenant", async () => {
    const defaults = (await call("GET", "/config", tenantA)).json();
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.autoAssignOnReceive, true);
    assert.equal(defaults.partialPolicy, "ship_available");
    const data = { companyId: tenantB, enabled: true, autoAssignOnReceive: false, autoDeliverSftp: false,
      defaultWarehouseId: warehouseA, fallbackWarehouseId: warehouseB, partialPolicy: "hold_all", addressMode: "zip_prefix" };
    const response = await call("PUT", "/config", tenantA, { data, snapshot: snapshotA });
    assert.equal(response.statusCode, 200);
    const saved = response.json();
    for (const field of ["enabled", "autoAssignOnReceive", "autoDeliverSftp", "defaultWarehouseId", "fallbackWarehouseId", "partialPolicy", "addressMode"]) assert.equal(saved[field], data[field]);
    assert.equal(saved.companyId, tenantA);
    assert.equal((await call("GET", "/config", tenantB)).json().enabled, false);
    assert.equal((await call("PUT", "/config", tenantA, { data: { defaultWarehouseId: warehouseC }, snapshot: snapshotA })).statusCode, 400);
    assert.equal((await call("PUT", "/config", tenantA, { data: { partialPolicy: "wrong" }, snapshot: snapshotA })).statusCode, 400);
  });

  await t.test("rule create/update/list keeps IDs, condition logic and signed ownership", async () => {
    const created = await create(tenantA, { companyId: tenantB, warehouseId: warehouseA, name: "A stock", priority: 1,
      conditionLogic: "or", requireAllItemsInStock: true, conditions: [{ field: "ship_country", operator: "equals", value: "US" }] }, snapshotA);
    assert.equal(created.statusCode, 201);
    ruleA = created.json();
    assert.equal(ruleA.companyId, tenantA);
    assert.equal(ruleA.conditionLogic, "or");
    ruleB = (await create(tenantB, { warehouseId: warehouseC, name: "B stock", requireAllItemsInStock: true }, snapshotB)).json();
    const updated = await call("PUT", `/rules/${ruleA._id}`, tenantA, { data: { name: "A updated", conditionLogic: "and", enabled: true }, snapshot: snapshotA });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json()._id, ruleA._id);
    assert.equal(updated.json().name, "A updated");
    assert.equal((await call("GET", "/rules", tenantA)).json().length, 1);
    assert.equal((await call("GET", "/rules", tenantB)).json()[0]._id, ruleB._id);
    assert.equal((await create(tenantA, { warehouseId: warehouseC }, snapshotA)).statusCode, 400);
  });

  await t.test("cross-tenant update, delete and mixed reorder cannot change another tenant", async () => {
    assert.equal((await call("PUT", `/rules/${ruleB._id}`, tenantA, { data: { name: "stolen" }, snapshot: snapshotA })).statusCode, 404);
    assert.equal((await call("DELETE", `/rules/${ruleB._id}`, tenantA)).statusCode, 404);
    assert.equal((await call("POST", "/rules/reorder", tenantA, { orderedIds: [ruleA._id, ruleB._id] })).statusCode, 404);
    assert.equal((await Rule.findById(ruleA._id)).priority, 1);
    assert.equal((await Rule.findById(ruleB._id)).name, "B stock");
    assert.equal((await call("POST", "/rules/reorder", tenantA, { orderedIds: [ruleA._id, ruleA._id] })).statusCode, 400);
    const reordered = await call("POST", "/rules/reorder", tenantA, { orderedIds: [ruleA._id] });
    assert.equal(reordered.statusCode, 200);
    assert.equal(reordered.json()[0].priority, 10);
  });

  await t.test("order, warehouse and inventory tenant mismatches are rejected", async () => {
    const decisions = [
      { order: { ...order, companyId: tenantB }, snapshot: snapshotA },
      { order, snapshot: snapshotB },
      { order, snapshot: { warehouses, inventory: [{ ...inventory[0], companyId: tenantB }] } },
      { order, snapshot: { warehouses, inventory: [{ ...inventory[0], warehouseId: warehouseC }] } },
    ];
    for (const body of decisions) assert.equal((await call("POST", "/resolve", tenantA, body)).statusCode, 403);
  });

  await t.test("concurrent tenant decisions never mix rules or inventory", async () => {
    await call("PUT", "/config", tenantB, { data: { enabled: true }, snapshot: snapshotB });
    const results = await Promise.all(Array.from({ length: 30 }, async (_unused, index) => {
      const isA = index % 2 === 0;
      const response = await call("POST", "/resolve", isA ? tenantA : tenantB,
        { order: isA ? order : { ...order, companyId: tenantB }, snapshot: isA ? snapshotA : snapshotB });
      assert.equal(response.statusCode, 200);
      if (isA) { assert.equal(response.json().warehouseId, warehouseA); assert.equal(response.json().ruleId, ruleA._id); }
      else assert.equal(response.json(), null);
    }));
    assert.equal(results.length, 30);
  });

  await t.test("store restriction removes disconnected rules/defaults/fallbacks; diagnostics retain metrics", async () => {
    const restricted = { warehouses: [warehouses[1]], inventory: inventory.filter((row) => row.warehouseId === warehouseB) };
    const resolved = await call("POST", "/resolve", tenantA, { order, snapshot: restricted });
    assert.equal(resolved.json().warehouseId, warehouseB);
    assert.equal(resolved.json().ruleId, null);
    assert.equal(resolved.json().fallbackWarehouseId, null);
    const empty = await call("POST", "/resolve", tenantA, { order, snapshot: { warehouses: [], inventory: [] } });
    assert.equal(empty.json(), null);
    const tested = await call("POST", "/test", tenantA, { order, snapshot: snapshotA });
    assert.equal(tested.statusCode, 200);
    assert.equal(tested.json().evaluations[0].matched, true);
    assert.equal(tested.json().metrics.total_quantity, 3);
    assert.equal(tested.json().config.autoAssignOnReceive, false);
    assert.equal(tested.json().result.warehouseId, warehouseA);
  });

  await t.test("readiness, malformed input and scoped deletion", async () => {
    assert.equal((await call("POST", "/resolve", tenantA, { order, snapshot: { warehouses: [null], inventory: [] } })).statusCode, 400);
    assert.equal((await call("POST", "/resolve", tenantA, { order, snapshot: { warehouses, inventory: [null] } })).statusCode, 400);
    assert.equal((await call("PUT", "/config", tenantA, { data: null, snapshot: snapshotA })).statusCode, 400);
    assert.equal((await call("PUT", "/rules/not-an-id", tenantA, { data: {}, snapshot: snapshotA })).statusCode, 400);
    assert.equal((await call("POST", "/rules/reorder", tenantA, { orderedIds: "bad" })).statusCode, 400);
    const notReady = buildApp({ secret, Rule, Config, ready: () => false });
    try {
      assert.equal((await notReady.inject({ method: "GET", url: "/ready" })).statusCode, 503);
      assert.equal((await notReady.inject(signed("GET", "/v1/routing/config", tenantA))).statusCode, 503);
    } finally { await notReady.close(); }
    const disposable = (await create(tenantA, { warehouseId: warehouseA, name: "delete me" }, snapshotA)).json();
    assert.equal((await call("DELETE", `/rules/${disposable._id}`, tenantA)).statusCode, 200);
    assert.equal((await call("DELETE", `/rules/${disposable._id}`, tenantA)).statusCode, 404);
  });

  await t.test("actual backend HTTP client signs requests and keeps tenant service errors", async () => {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const client = loadModule(adapterPath("client.js"), {
      "../../config/env": { routingMsBaseUrl: address, routingMsSecret: secret, routingMsTimeoutMs: 1000 },
      "../../utils/httpError": { httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }) },
    }, { fetch, URL, AbortSignal, Buffer });
    assert.equal((await client.request(tenantA, "/config")).companyId, tenantA);
    assert.equal((await client.request(tenantB, "/rules"))[0]._id, ruleB._id);
    await assert.rejects(client.request(tenantA, `/rules/${ruleB._id}`, { method: "DELETE" }), { statusCode: 404 });
    const unavailable = loadModule(adapterPath("client.js"), {
      "../../config/env": { routingMsBaseUrl: address, routingMsSecret: secret, routingMsTimeoutMs: 1000 },
      "../../utils/httpError": { httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }) },
    }, { fetch: async () => { throw new Error("offline"); }, URL, AbortSignal, Buffer });
    await assert.rejects(unavailable.request(tenantA, "/config"), { statusCode: 503 });
  });

  await t.test("backend snapshot uses tenant filter and excludes warehouse secrets", async () => {
    let inventoryFilter, sent;
    const service = loadModule(adapterPath("service.js"), {
      "./client": { request: async (companyId, path, options) => { sent = { companyId, path, ...options }; return null; } },
      "../companies/warehouseModel": { find: () => ({ lean: async () => warehouses }) },
      "./inventoryModel": { find: (filter) => { inventoryFilter = filter; return { select: () => ({ lean: async () => inventory }) }; } },
      "../../utils/httpError": { httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }) },
      "./metadata": {}, "./inventoryService": {},
      "../shops/warehouses": { allowedWarehouses: async () => warehouses.map((warehouse) => ({ ...warehouse, sftpPassword: "never-transmit", modernwmsToken: "secret" })) },
    });
    await service.resolveForOrder(order, tenantA);
    assert.equal(inventoryFilter.companyId, tenantA);
    assert.deepEqual(JSON.parse(JSON.stringify(inventoryFilter.warehouseId.$in)), [warehouseA, warehouseB]);
    assert.equal(sent.companyId, tenantA);
    assert.equal(sent.path, "/resolve");
    assert.equal(JSON.stringify(sent.json).includes("never-transmit"), false);
    await assert.rejects(service.resolveForOrder({ ...order, companyId: tenantB }, tenantA), { statusCode: 403 });
  });

  await t.test("migration dry-run, exact copy, rerun and conflict rejection preserve tenants and IDs", async () => {
    const source = await mongoose.createConnection(mongod.getUri("migration_source")).asPromise();
    const target = await mongoose.createConnection(mongod.getUri("migration_target")).asPromise();
    try {
      await source.collection("companies").insertMany([{ _id: new mongoose.Types.ObjectId(tenantA) }, { _id: new mongoose.Types.ObjectId(tenantB) }]);
      await source.collection("warehouses").insertMany([...warehouses, ...snapshotB.warehouses].map((row) => ({ ...row, _id: new mongoose.Types.ObjectId(row._id), companyId: new mongoose.Types.ObjectId(row.companyId) })));
      const configs = await Config.find().lean();
      const rules = await Rule.find().lean();
      await source.collection("routing_configs").insertMany(configs);
      await source.collection("routing_rules").insertMany(rules);
      assert.deepEqual(await migrate(source, target), { routing_configs: 2, routing_rules: 2 });
      assert.equal(await target.collection("routing_rules").countDocuments(), 0);
      await migrate(source, target, { apply: true });
      await migrate(source, target, { apply: true });
      assert.equal(await target.collection("routing_rules").countDocuments(), 2);
      assert.deepEqual(await target.collection("routing_rules").findOne({ _id: rules[0]._id }), rules[0]);
      await target.collection("routing_rules").updateOne({ _id: rules[0]._id }, { $set: { name: "destination changed" } });
      await assert.rejects(migrate(source, target, { apply: true }), /Destination conflict/);
      assert.equal((await source.collection("routing_rules").findOne({ _id: rules[0]._id })).name, rules[0].name);
    } finally { await source.close(); await target.close(); }
  });
});
