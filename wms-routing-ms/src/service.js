const { createEngine } = require("./engine");

const error = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const id = (value) => String(value || "");
function objectId(value, label = "ID") {
  if (!/^[a-f\d]{24}$/i.test(id(value))) throw error(400, `Invalid ${label}`);
  return id(value).toLowerCase();
}

function validateSnapshot(companyId, snapshot, order) {
  if (!snapshot || !Array.isArray(snapshot.warehouses) || !Array.isArray(snapshot.inventory)) {
    throw error(400, "Warehouse and inventory snapshot required");
  }
  if (order?.companyId && id(order.companyId).toLowerCase() !== companyId) throw error(403, "Order tenant mismatch");
  const warehouseIds = new Set();
  for (const warehouse of snapshot.warehouses) {
    if (!warehouse || typeof warehouse !== "object" || Array.isArray(warehouse)) throw error(400, "Invalid warehouse snapshot");
    if (id(warehouse.companyId).toLowerCase() !== companyId) throw error(403, "Warehouse tenant mismatch");
    const warehouseId = objectId(warehouse._id, "warehouse ID");
    if (warehouseIds.has(warehouseId)) throw error(400, "Duplicate warehouse");
    warehouseIds.add(warehouseId);
  }
  for (const row of snapshot.inventory) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw error(400, "Invalid inventory snapshot");
    if (id(row.companyId).toLowerCase() !== companyId || !warehouseIds.has(id(row.warehouseId).toLowerCase())) {
      throw error(403, "Inventory tenant mismatch");
    }
  }
  return warehouseIds;
}

function createRoutingService({ Rule, Config, mapbox }) {
  async function getConfig(companyId) {
    const config = await Config.findOne({ companyId }).lean() || {
      companyId, enabled: false, autoAssignOnReceive: true, autoDeliverSftp: true,
      defaultWarehouseId: null, fallbackWarehouseId: null, partialPolicy: "ship_available", addressMode: "off",
    };
    if (!config.partialPolicy) config.partialPolicy = "ship_available";
    if (!config.addressMode) config.addressMode = "off";
    return config;
  }
  const listRules = (companyId) => Rule.find({ companyId }).sort({ priority: 1, createdAt: 1 }).lean();
  function requireWarehouse(value, allowed) {
    if (value && !allowed.has(objectId(value, "warehouse ID"))) throw error(400, "Invalid warehouse");
  }
  async function saveConfig(companyId, data, snapshot) {
    const allowed = validateSnapshot(companyId, snapshot);
    requireWarehouse(data.defaultWarehouseId, allowed);
    requireWarehouse(data.fallbackWarehouseId, allowed);
    const update = {
      enabled: data.enabled, autoAssignOnReceive: data.autoAssignOnReceive, autoDeliverSftp: data.autoDeliverSftp,
      defaultWarehouseId: data.defaultWarehouseId || null, fallbackWarehouseId: data.fallbackWarehouseId || null,
      partialPolicy: data.partialPolicy, addressMode: data.addressMode,
    };
    Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
    return Config.findOneAndUpdate({ companyId }, { $set: { ...update, companyId } },
      { upsert: true, returnDocument: "after", lean: true, runValidators: true });
  }
  async function createRule(companyId, data, snapshot) {
    const allowed = validateSnapshot(companyId, snapshot);
    if (!data.warehouseId) throw error(400, "Warehouse is required");
    requireWarehouse(data.warehouseId, allowed);
    return Rule.create({
      companyId, name: String(data.name || "").trim() || "Untitled rule", priority: Number(data.priority) || 100,
      enabled: data.enabled !== false, warehouseId: data.warehouseId,
      conditionLogic: data.conditionLogic === "or" ? "or" : "and",
      conditions: Array.isArray(data.conditions) ? data.conditions : [], requireAllItemsInStock: Boolean(data.requireAllItemsInStock),
    });
  }
  async function updateRule(companyId, ruleId, data, snapshot) {
    const allowed = validateSnapshot(companyId, snapshot);
    const rule = await Rule.findOne({ _id: objectId(ruleId, "rule ID"), companyId });
    if (!rule) throw error(404, "Rule not found");
    if (data.warehouseId) { requireWarehouse(data.warehouseId, allowed); rule.warehouseId = data.warehouseId; }
    if (data.name !== undefined) rule.name = String(data.name || "").trim() || rule.name;
    if (data.priority !== undefined) rule.priority = Number(data.priority) || rule.priority;
    if (data.enabled !== undefined) rule.enabled = Boolean(data.enabled);
    if (data.conditionLogic !== undefined) rule.conditionLogic = data.conditionLogic === "or" ? "or" : "and";
    if (data.conditions !== undefined) rule.conditions = Array.isArray(data.conditions) ? data.conditions : [];
    if (data.requireAllItemsInStock !== undefined) rule.requireAllItemsInStock = Boolean(data.requireAllItemsInStock);
    await rule.save();
    return rule;
  }
  async function deleteRule(companyId, ruleId) {
    const result = await Rule.deleteOne({ _id: objectId(ruleId, "rule ID"), companyId });
    if (!result.deletedCount) throw error(404, "Rule not found");
    return { deleted: true };
  }
  async function reorderRules(companyId, orderedIds) {
    if (!Array.isArray(orderedIds)) throw error(400, "orderedIds must be an array");
    const ids = orderedIds.map((value) => objectId(value, "rule ID"));
    if (new Set(ids).size !== ids.length) throw error(400, "Duplicate rule IDs");
    const count = await Rule.countDocuments({ companyId, _id: { $in: ids } });
    if (count !== ids.length) throw error(404, "Rule not found");
    await Promise.all(ids.map((_id, index) => Rule.updateOne({ _id, companyId }, { $set: { priority: (index + 1) * 10 } })));
    return listRules(companyId);
  }
  async function decide(companyId, order, snapshot, test = false) {
    if (!order || typeof order !== "object" || Array.isArray(order)) throw error(400, "Order required");
    const allowed = validateSnapshot(companyId, snapshot, order);
    const engine = createEngine({
      mapbox,
      loadInventoryMap: async (warehouseId, skus) => new Map(snapshot.inventory
        .filter((row) => id(row.warehouseId) === id(warehouseId) && skus.includes(row.sku))
        .map((row) => [row.sku.toUpperCase(), row])),
    });
    const [config, allRules] = await Promise.all([getConfig(companyId), listRules(companyId)]);
    const rules = allRules.filter((rule) => allowed.has(id(rule.warehouseId)));
    // Resolve snapshots contain only the store's connected, active warehouses.
    // Test snapshots include every tenant warehouse for diagnostics.
    const effectiveConfig = { ...config,
      defaultWarehouseId: allowed.has(id(config.defaultWarehouseId)) ? config.defaultWarehouseId : null,
      fallbackWarehouseId: allowed.has(id(config.fallbackWarehouseId)) ? config.fallbackWarehouseId : null,
    };
    const warehouses = snapshot.warehouses.filter((warehouse) => warehouse.isActive !== false);
    const result = await engine.routeOrder(order, companyId, rules, effectiveConfig, warehouses);
    if (!test) return result;
    const evaluations = [];
    for (const rule of allRules) evaluations.push({
      ruleId: id(rule._id), ruleName: rule.name, priority: rule.priority, enabled: rule.enabled,
      warehouseId: id(rule.warehouseId), matched: allowed.has(id(rule.warehouseId)) && await engine.evaluateRule(rule, order),
    });
    return { result, evaluations, metrics: engine.getOrderMetrics(order), config };
  }
  return { getConfig, saveConfig, listRules, createRule, updateRule, deleteRule, reorderRules, decide };
}

module.exports = { createRoutingService, validateSnapshot, objectId };
