const client = require("./client");
const Warehouse = require("../companies/warehouseModel");
const WarehouseInventory = require("./inventoryModel");
const { httpError } = require("../../utils/httpError");

// Never send warehouse credentials across the routing boundary.
function warehouseInput(warehouse) {
  const row = warehouse.toObject ? warehouse.toObject() : warehouse;
  return Object.fromEntries(["_id", "companyId", "name", "isActive", "zipPrefixes", "routingPriority", "latitude", "longitude", "address"]
    .map((key) => [key, row[key]]));
}
function orderInput(order, companyId) {
  if (order.companyId && String(order.companyId) !== String(companyId)) throw httpError(403, "Order tenant mismatch");
  const row = order.toObject ? order.toObject() : order;
  return Object.fromEntries(["companyId", "shopId", "lineItems", "payload", "email", "shippingAddress", "isB2B", "poNumber", "riskLevel", "shippingMethod"]
    .map((key) => [key, row[key]]));
}
async function snapshot(companyId, warehouses, order) {
  const skus = (order?.lineItems || []).map((line) => String(line.sku || "").trim()).filter(Boolean);
  const inventory = skus.length ? await WarehouseInventory.find({
    companyId, warehouseId: { $in: warehouses.map((warehouse) => warehouse._id) }, sku: { $in: skus },
  }).select("companyId warehouseId sku quantityOnHand quantityAvailable reserved").lean() : [];
  return { warehouses: warehouses.map(warehouseInput), inventory };
}
async function tenantSnapshot(companyId) {
  return snapshot(companyId, await Warehouse.find({ companyId }).lean());
}
const getConfig = (companyId) => client.request(companyId, "/config");
const listRules = (companyId) => client.request(companyId, "/rules");
async function saveConfig(companyId, data) {
  return client.request(companyId, "/config", { method: "PUT", json: { data, snapshot: await tenantSnapshot(companyId) } });
}
async function createRule(companyId, data) {
  return client.request(companyId, "/rules", { method: "POST", json: { data, snapshot: await tenantSnapshot(companyId) } });
}
async function updateRule(companyId, ruleId, data) {
  return client.request(companyId, `/rules/${encodeURIComponent(String(ruleId))}`, { method: "PUT", json: { data, snapshot: await tenantSnapshot(companyId) } });
}
const deleteRule = (companyId, ruleId) => client.request(companyId, `/rules/${encodeURIComponent(String(ruleId))}`, { method: "DELETE" });
const reorderRules = (companyId, orderedIds) => client.request(companyId, "/rules/reorder", { method: "POST", json: { orderedIds } });
async function resolveForOrder(order, companyId) {
  const input = orderInput(order, companyId);
  const warehouses = await require("../shops/warehouses").allowedWarehouses(companyId, order.shopId);
  return client.request(companyId, "/resolve", { method: "POST", json: { order: input, snapshot: await snapshot(companyId, warehouses, input) } });
}
async function testRouting(companyId, order) {
  const input = orderInput(order, companyId);
  const warehouses = await Warehouse.find({ companyId }).lean();
  return client.request(companyId, "/test", { method: "POST", json: { order: input, snapshot: await snapshot(companyId, warehouses, input) } });
}

module.exports = { ...require("./metadata"), ...require("./inventoryService"), getConfig, saveConfig, listRules,
  createRule, updateRule, deleteRule, reorderRules, resolveForOrder, testRouting };
