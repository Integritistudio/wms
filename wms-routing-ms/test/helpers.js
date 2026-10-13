const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { signature } = require("../src/auth");

const secret = "routing-test-secret-0123456789-abcdef";
const tenantA = "111111111111111111111111";
const tenantB = "222222222222222222222222";
const warehouseA = "aaaaaaaaaaaaaaaaaaaaaaaa";
const warehouseB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const warehouseC = "cccccccccccccccccccccccc";
const order = {
  companyId: tenantA, lineItems: [{ sku: "SKU-1", quantity: 2 }, { sku: "SKU-2", quantity: 1 }],
  shippingAddress: { countryCode: "US", provinceCode: "TX", city: "Austin", zip: "78701", address1: "1 Main St" },
  payload: { total_price: "120", total_weight: 400, tags: "VIP, wholesale", email: "BUYER@example.com" },
  isB2B: true, poNumber: "PO-1", riskLevel: "LOW", shippingMethod: { isExpedited: true, shopifyServiceCode: "EXPRESS" },
};
const warehouses = [
  { _id: warehouseA, companyId: tenantA, name: "Austin", isActive: true, zipPrefixes: ["787"], routingPriority: 10, latitude: 30, longitude: -97 },
  { _id: warehouseB, companyId: tenantA, name: "Dallas", isActive: true, zipPrefixes: ["752"], routingPriority: 20, latitude: 33, longitude: -96 },
];
const inventory = [
  { companyId: tenantA, warehouseId: warehouseA, sku: "SKU-1", quantityOnHand: 10, quantityAvailable: 2, reserved: 8 },
  { companyId: tenantA, warehouseId: warehouseA, sku: "SKU-2", quantityOnHand: 10, quantityAvailable: 1, reserved: 9 },
  { companyId: tenantA, warehouseId: warehouseB, sku: "SKU-1", quantityOnHand: 10, quantityAvailable: 0, reserved: 10 },
];
function loadModule(file, replacements, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports,
    require: (name) => {
      if (Object.hasOwn(replacements, name)) return replacements[name];
      if (name.startsWith("node:")) return require(name);
      throw new Error(`Unexpected dependency ${name} in ${file}`);
    }, ...globals }, { filename: file });
  return module.exports;
}
const adapterPath = (name) => path.join(__dirname, "../integration/backend/routing", name);
const backendPath = (...parts) => path.join(__dirname, "../../wms-app-backend", ...parts);
function signed(method, url, tenantId, json, options = {}) {
  const timestamp = options.timestamp || String(Date.now());
  const body = json === undefined ? "" : JSON.stringify(json);
  return { method, url, ...(json === undefined ? {} : { payload: body }), headers: {
    "x-routing-tenant": tenantId, "x-routing-timestamp": timestamp,
    "x-routing-signature": signature(secret, { method, url, tenantId, timestamp, body }),
    ...(json === undefined ? {} : { "content-type": "application/json" }),
  } };
}
module.exports = { secret, tenantA, tenantB, warehouseA, warehouseB, warehouseC, order, warehouses, inventory, loadModule, backendPath, adapterPath, signed };
