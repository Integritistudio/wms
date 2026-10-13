const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createEngine } = require("../src/engine");
const { createMapbox } = require("../src/mapbox");
const { tenantA, warehouseA, warehouseB, order, warehouses, inventory, loadModule, backendPath } = require("./helpers");

const mapbox = { ...createMapbox(), geocode: async () => ({ lat: 30, lng: -97 }) };
const engine = createEngine({ mapbox, loadInventoryMap: async (warehouseId, skus) => new Map(inventory
  .filter((row) => row.warehouseId === String(warehouseId) && skus.includes(row.sku)).map((row) => [row.sku.toUpperCase(), row])) });
const original = loadModule(backendPath("src/modules/routing/engine.js"), {
  "./inventoryModel": { find: ({ warehouseId, sku }) => ({ lean: async () => inventory.filter((row) => row.warehouseId === String(warehouseId) && sku.$in.includes(row.sku)) }) },
  "./mapbox": mapbox,
});
const rule = (conditions, extra = {}) => ({ _id: "dddddddddddddddddddddddd", warehouseId: warehouseA,
  name: "VIP route", enabled: true, conditionLogic: "and", conditions, ...extra });
const config = { enabled: true, defaultWarehouseId: warehouseB, fallbackWarehouseId: warehouseA, addressMode: "off" };

test("all existing routing fields and operators retain evaluator behavior", async () => {
  assert.deepEqual(engine.ROUTING_FIELDS, JSON.parse(JSON.stringify(original.ROUTING_FIELDS)));
  assert.deepEqual(engine.OPERATORS, JSON.parse(JSON.stringify(original.OPERATORS)));
  const values = ["", "2", "US", "SKU-1", "SKU-1,SKU-2", "SKU-1:2", "VIP", "true"];
  for (const field of engine.ROUTING_FIELDS) for (const operator of engine.OPERATORS) for (const value of values) {
    const item = rule([{ field: field.id, operator: operator.id, value }]);
    assert.equal(await engine.evaluateRule(item, order), await original.evaluateRule(item, order), `${field.id}/${operator.id}/${value}`);
  }
  for (const conditionLogic of ["and", "or"]) for (const requireAllItemsInStock of [true, false]) {
    const item = rule([{ field: "ship_country", operator: "equals", value: "US" }, { field: "order_total", operator: "less_than", value: "10" }], { conditionLogic, requireAllItemsInStock });
    assert.equal(await engine.evaluateRule(item, order), await original.evaluateRule(item, order));
  }
});

test("rules, defaults, fallback, disabled routing and no-match outputs remain identical", async () => {
  const cases = [
    [[], { enabled: false }], [[], config], [[], { enabled: true, fallbackWarehouseId: warehouseA }],
    [[], { enabled: true }], [ [rule([])], config ], [ [rule([], { enabled: false })], config ],
    [ [rule([{ field: "ship_country", operator: "equals", value: "US" }])], config ],
    [[], { ...config, addressMode: "zip_prefix" }], [[], { ...config, addressMode: "mapbox_distance" }],
  ];
  for (const [rules, settings] of cases) {
    assert.deepEqual(await engine.routeOrder(order, tenantA, rules, settings, warehouses),
      JSON.parse(JSON.stringify(await original.routeOrder(order, tenantA, rules, settings, warehouses))));
  }
  const result = await engine.routeOrder(order, tenantA, [rule([])], config, warehouses);
  assert.equal(result.warehouseId, warehouseA);
  assert.equal(result.reason, "Matched rule: VIP route");
  assert.equal(result.fallbackWarehouseId, warehouseA);
  const zipMiss = await engine.routeOrder({ ...order, shippingAddress: { zip: "10001" } }, tenantA, [], { enabled: true, addressMode: "zip_prefix" }, warehouses);
  assert.equal(zipMiss, null);
});

test("inventory rules use available stock, stock gates, and request-specific rows", async () => {
  assert.equal(await engine.evaluateRule(rule([], { requireAllItemsInStock: true }), order), true);
  assert.equal(await engine.evaluateRule(rule([], { warehouseId: warehouseB, requireAllItemsInStock: true }), order), false);
  const independent = createEngine({ mapbox, loadInventoryMap: async () => new Map() });
  assert.equal(await independent.evaluateRule(rule([], { requireAllItemsInStock: true }), order), false);
  assert.equal(await engine.evaluateRule(rule([{ field: "sku_stock_gte", operator: "greater_or_equal", value: "SKU-1:3" }]), order), false);
});

test("Mapbox missing token, network errors, ZIP normalization and nearest distance", async () => {
  assert.equal(await createMapbox().geocode("Austin"), null);
  const mock = createMapbox({ token: "test", logger: { warn() {} }, fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ center: [-97, 30], context: [{ id: "postcode.1", text: "78701" }] }] }) }) });
  assert.deepEqual(await mock.geocode("Austin"), { lat: 30, lng: -97, placeName: "", zip: "78701" });
  const failed = createMapbox({ token: "test", logger: { warn() {} }, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(await failed.geocode("Austin"), null);
  assert.equal(mock.zipMatchesPrefixes("SW1A 1AA", ["SW1A"]), true);
  assert.equal(mock.zipMatchesPrefixes("78701-1234", ["78701"]), true);
  const nearest = await engine.routeOrder(order, tenantA, [], { ...config, addressMode: "mapbox_distance" }, warehouses);
  assert.equal(nearest.warehouseId, warehouseA);
  assert.match(nearest.reason, /~0.0 km/);
});
