const WarehouseInventory = require("../routing/inventoryModel");
const logger = require("../../config/logger");

function normalizeSku(sku) {
  return String(sku || "").trim();
}

async function getAvailable(warehouseId, sku) {
  const key = normalizeSku(sku);
  if (!key) return 0;
  const row = await WarehouseInventory.findOne({ warehouseId, sku: key }).lean();
  if (!row) {
    const upper = await WarehouseInventory.findOne({ warehouseId, sku: key.toUpperCase() }).lean();
    if (!upper) return 0;
    return Number(upper.quantityAvailable ?? upper.quantityOnHand) || 0;
  }
  return Number(row.quantityAvailable ?? row.quantityOnHand) || 0;
}

async function findRow(warehouseId, sku) {
  const key = normalizeSku(sku);
  if (!key) return null;
  return (
    (await WarehouseInventory.findOne({ warehouseId, sku: key })) ||
    (await WarehouseInventory.findOne({ warehouseId, sku: key.toUpperCase() }))
  );
}

async function reserve({ companyId, warehouseId, sku, quantity }) {
  const qty = Number(quantity) || 0;
  const key = normalizeSku(sku);
  if (qty <= 0 || !key) return null;

  const row = await WarehouseInventory.findOneAndUpdate(
    {
      warehouseId,
      sku: key,
      $expr: {
        $gte: [{ $ifNull: ["$quantityAvailable", "$quantityOnHand"] }, qty],
      },
    },
    {
      $inc: { quantityAvailable: -qty, reserved: qty },
      $setOnInsert: {
        companyId,
        warehouseId,
        sku: key,
        quantityOnHand: 0,
      },
    },
    { new: true, upsert: false }
  );

  if (!row) {
    logger.warn({ warehouseId: String(warehouseId), sku: key, quantity: qty }, "Inventory reserve failed — insufficient stock");
  }
  return row;
}

async function release({ warehouseId, sku, quantity }) {
  const qty = Number(quantity) || 0;
  const key = normalizeSku(sku);
  if (qty <= 0 || !key) return null;

  return WarehouseInventory.findOneAndUpdate(
    { warehouseId, sku: key },
    {
      $inc: { quantityAvailable: qty, reserved: -qty },
    },
    { new: true }
  );
}

/**
 * After ship: reduce on-hand. If stock was reserved, clear reservation;
 * otherwise also reduce available (manual ship / no allocate path).
 */
async function consumeReserved({ warehouseId, sku, quantity }) {
  const qty = Number(quantity) || 0;
  const key = normalizeSku(sku);
  if (qty <= 0 || !key) return null;

  const existing = await findRow(warehouseId, key);
  if (!existing) {
    logger.warn({ warehouseId: String(warehouseId), sku: key, quantity: qty }, "Inventory consume skipped — no stock row");
    return null;
  }

  const reserved = Math.max(0, Number(existing.reserved) || 0);
  const fromReserved = Math.min(reserved, qty);
  const fromAvailable = qty - fromReserved;

  const updated = await WarehouseInventory.findOneAndUpdate(
    { _id: existing._id },
    {
      $inc: {
        quantityOnHand: -qty,
        reserved: -fromReserved,
        quantityAvailable: -fromAvailable,
      },
    },
    { new: true }
  );

  if (updated) {
    // Clamp floors so bad data cannot go endlessly negative in display
    let dirty = false;
    if (updated.quantityOnHand < 0) {
      updated.quantityOnHand = 0;
      dirty = true;
    }
    if (updated.quantityAvailable < 0) {
      updated.quantityAvailable = 0;
      dirty = true;
    }
    if (updated.reserved < 0) {
      updated.reserved = 0;
      dirty = true;
    }
    if (dirty) await updated.save();
  }

  return updated;
}

async function stockMapForWarehouse(warehouseId, skus) {
  const normalized = (skus || []).map((s) => normalizeSku(s)).filter(Boolean);
  const upper = normalized.map((s) => s.toUpperCase());
  const rows = await WarehouseInventory.find({
    warehouseId,
    $or: [{ sku: { $in: normalized } }, { sku: { $in: upper } }],
  }).lean();
  return new Map(rows.map((r) => [String(r.sku).toUpperCase(), Number(r.quantityAvailable ?? r.quantityOnHand) || 0]));
}

/**
 * Add stock back after a return (creates row if missing).
 */
async function restock({ companyId, warehouseId, sku, quantity }) {
  const qty = Number(quantity) || 0;
  const key = normalizeSku(sku);
  if (qty <= 0 || !key || !warehouseId) return null;

  let row = await findRow(warehouseId, key);
  if (!row) {
    row = await WarehouseInventory.create({
      companyId,
      warehouseId,
      sku: key,
      quantityOnHand: qty,
      quantityAvailable: qty,
      reserved: 0,
    });
    return row;
  }

  return WarehouseInventory.findOneAndUpdate(
    { _id: row._id },
    {
      $inc: {
        quantityOnHand: qty,
        quantityAvailable: qty,
      },
    },
    { new: true }
  );
}

module.exports = {
  getAvailable,
  reserve,
  release,
  consumeReserved,
  restock,
  stockMapForWarehouse,
  normalizeSku,
};
