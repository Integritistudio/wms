const Warehouse = require("../companies/warehouseModel");
const WarehouseInventory = require("./inventoryModel");
const { httpError } = require("../../utils/httpError");

async function listInventory(companyId, warehouseId) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }
  return WarehouseInventory.find({ companyId, warehouseId: warehouse._id }).sort({ sku: 1 }).lean();
}

async function upsertInventory(companyId, warehouseId, items) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }

  const inventory = require("../fulfillment/inventory");
  const results = [];
  for (const item of items || []) {
    const sku = String(item.sku || "").trim();
    if (!sku) continue;

    const existing = await inventory.findRow(warehouse._id, sku);
    if (existing && String(existing.companyId) !== String(companyId)) {
      throw httpError(409, "Inventory ownership mismatch");
    }
    const reserved = existing ? Math.max(0, Number(existing.reserved) || 0) : 0;
    const skuKey = existing?.sku || sku;

    // adjustBy: receive/add stock without wiping reservations
    if (item.adjustBy != null && item.adjustBy !== "") {
      const delta = Number(item.adjustBy) || 0;
      if (existing) {
        const row = await WarehouseInventory.findOneAndUpdate(
          { _id: existing._id, companyId },
          { $inc: { quantityOnHand: delta, quantityAvailable: delta } },
          { returnDocument: "after", lean: true }
        );
        results.push(row);
      } else {
        const row = await WarehouseInventory.findOneAndUpdate(
          { companyId, warehouseId: warehouse._id, sku: skuKey },
          {
            $inc: { quantityOnHand: delta, quantityAvailable: delta },
            $setOnInsert: {
              companyId: warehouse.companyId,
              warehouseId: warehouse._id,
              sku: skuKey,
              reserved: 0,
            },
          },
          { upsert: true, returnDocument: "after", lean: true }
        );
        results.push(row);
      }
      continue;
    }

    // Absolute set of on-hand; keep reserved, recompute available
    const onHand = Math.max(0, Number(item.quantityOnHand) || 0);
    const available = Math.max(0, onHand - reserved);
    if (existing) {
      const row = await WarehouseInventory.findOneAndUpdate(
        { _id: existing._id, companyId },
        {
          $set: {
            quantityOnHand: onHand,
            quantityAvailable: available,
          },
        },
        { returnDocument: "after", lean: true }
      );
      results.push(row);
    } else {
      const row = await WarehouseInventory.findOneAndUpdate(
        { companyId, warehouseId: warehouse._id, sku: skuKey },
        {
          $set: {
            companyId: warehouse.companyId,
            warehouseId: warehouse._id,
            sku: skuKey,
            quantityOnHand: onHand,
            quantityAvailable: available,
          },
          $setOnInsert: { reserved: 0 },
        },
        { upsert: true, returnDocument: "after", lean: true }
      );
      results.push(row);
    }
  }
  return results;
}

async function deleteInventoryItem(companyId, warehouseId, sku) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }
  await WarehouseInventory.deleteOne({ companyId, warehouseId: warehouse._id, sku: String(sku || "").trim() });
}

module.exports = { listInventory, upsertInventory, deleteInventoryItem };
