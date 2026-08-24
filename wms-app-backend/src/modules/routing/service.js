const RoutingRule = require("./ruleModel");
const RoutingConfig = require("./configModel");
const WarehouseInventory = require("./inventoryModel");
const Warehouse = require("../companies/warehouseModel");
const { routeOrder, ROUTING_FIELDS, OPERATORS, getOrderMetrics, evaluateRule } = require("./engine");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");

async function getConfig(companyId) {
  let config = await RoutingConfig.findOne({ companyId }).lean();
  if (!config) {
    config = {
      companyId,
      enabled: false,
      autoAssignOnReceive: true,
      autoDeliverSftp: true,
      defaultWarehouseId: null,
      fallbackWarehouseId: null,
      partialPolicy: "ship_available",
      addressMode: "off",
    };
  }
  if (!config.partialPolicy) config.partialPolicy = "ship_available";
  if (!config.addressMode) config.addressMode = "off";
  return config;
}

async function saveConfig(companyId, data) {
  const allowed = {
    enabled: data.enabled,
    autoAssignOnReceive: data.autoAssignOnReceive,
    autoDeliverSftp: data.autoDeliverSftp,
    defaultWarehouseId: data.defaultWarehouseId || null,
    fallbackWarehouseId: data.fallbackWarehouseId || null,
    partialPolicy: data.partialPolicy,
    addressMode: data.addressMode,
  };
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  return RoutingConfig.findOneAndUpdate(
    { companyId },
    { $set: { ...allowed, companyId } },
    { upsert: true, new: true, lean: true }
  );
}

async function listRules(companyId) {
  return RoutingRule.find({ companyId }).sort({ priority: 1, createdAt: 1 }).lean();
}

async function createRule(companyId, data) {
  const warehouse = await Warehouse.findById(data.warehouseId);
  if (!warehouse || String(warehouse.companyId) !== String(companyId)) {
    throw httpError(400, "Invalid warehouse");
  }
  return RoutingRule.create({ ...data, companyId });
}

async function updateRule(companyId, ruleId, data) {
  const rule = await RoutingRule.findOne({ _id: ruleId, companyId });
  if (!rule) throw httpError(404, "Rule not found");
  if (data.warehouseId) {
    const warehouse = await Warehouse.findById(data.warehouseId);
    if (!warehouse || String(warehouse.companyId) !== String(companyId)) {
      throw httpError(400, "Invalid warehouse");
    }
  }
  Object.assign(rule, data);
  await rule.save();
  return rule;
}

async function deleteRule(companyId, ruleId) {
  const result = await RoutingRule.deleteOne({ _id: ruleId, companyId });
  if (!result.deletedCount) throw httpError(404, "Rule not found");
}

async function reorderRules(companyId, orderedIds) {
  const updates = orderedIds.map((id, index) =>
    RoutingRule.updateOne({ _id: id, companyId }, { $set: { priority: (index + 1) * 10 } })
  );
  await Promise.all(updates);
  return listRules(companyId);
}

async function resolveForOrder(order, companyId) {
  const [config, rules, warehouses] = await Promise.all([
    getConfig(companyId),
    listRules(companyId),
    Warehouse.find({ companyId, isActive: { $ne: false } }).lean(),
  ]);
  return routeOrder(order, companyId, rules, config, warehouses);
}

async function testRouting(companyId, orderData) {
  const [config, rules, warehouses] = await Promise.all([
    getConfig(companyId),
    listRules(companyId),
    Warehouse.find({ companyId, isActive: { $ne: false } }).lean(),
  ]);
  const metrics = getOrderMetrics(orderData);
  const evaluations = [];

  for (const rule of rules) {
    const matched = await evaluateRule(rule, orderData);
    evaluations.push({
      ruleId: rule._id.toString(),
      ruleName: rule.name,
      priority: rule.priority,
      enabled: rule.enabled,
      warehouseId: rule.warehouseId.toString(),
      matched,
    });
  }

  const result = await routeOrder(orderData, companyId, rules, config, warehouses);
  return { result, evaluations, metrics, config };
}

async function listInventory(companyId, warehouseId) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }
  return WarehouseInventory.find({ warehouseId: warehouse._id }).sort({ sku: 1 }).lean();
}

async function upsertInventory(companyId, warehouseId, items) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }

  const results = [];
  for (const item of items || []) {
    const sku = String(item.sku || "").trim();
    if (!sku) continue;

    const existing = await WarehouseInventory.findOne({ warehouseId: warehouse._id, sku });
    const reserved = existing ? Math.max(0, Number(existing.reserved) || 0) : 0;

    // adjustBy: receive/add stock without wiping reservations
    if (item.adjustBy != null && item.adjustBy !== "") {
      const delta = Number(item.adjustBy) || 0;
      const row = await WarehouseInventory.findOneAndUpdate(
        { warehouseId: warehouse._id, sku },
        {
          $inc: { quantityOnHand: delta, quantityAvailable: delta },
          $setOnInsert: {
            companyId: warehouse.companyId,
            warehouseId: warehouse._id,
            sku,
            reserved: 0,
          },
        },
        { upsert: true, returnDocument: "after", lean: true }
      );
      results.push(row);
      continue;
    }

    // Absolute set of on-hand; keep reserved, recompute available
    const onHand = Math.max(0, Number(item.quantityOnHand) || 0);
    const available = Math.max(0, onHand - reserved);
    const row = await WarehouseInventory.findOneAndUpdate(
      { warehouseId: warehouse._id, sku },
      {
        $set: {
          companyId: warehouse.companyId,
          warehouseId: warehouse._id,
          sku,
          quantityOnHand: onHand,
          quantityAvailable: available,
        },
        $setOnInsert: { reserved: 0 },
      },
      { upsert: true, returnDocument: "after", lean: true }
    );
    results.push(row);
  }
  return results;
}

async function deleteInventoryItem(companyId, warehouseId, sku) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }
  await WarehouseInventory.deleteOne({ warehouseId: warehouse._id, sku: String(sku || "").trim() });
}

module.exports = {
  ROUTING_FIELDS,
  OPERATORS,
  getConfig,
  saveConfig,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  reorderRules,
  resolveForOrder,
  testRouting,
  listInventory,
  upsertInventory,
  deleteInventoryItem,
};
