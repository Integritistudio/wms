const WarehouseInventory = require("../routing/inventoryModel");
const logger = require("../../config/logger");

function normalizeSku(sku) {
  return String(sku || "").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive SKU match within a warehouse (never creates duplicates). */
async function findRow(warehouseId, sku) {
  const key = normalizeSku(sku);
  if (!key || !warehouseId) return null;

  const exact =
    (await WarehouseInventory.findOne({ warehouseId, sku: key })) ||
    (await WarehouseInventory.findOne({ warehouseId, sku: key.toUpperCase() })) ||
    (await WarehouseInventory.findOne({ warehouseId, sku: key.toLowerCase() }));
  if (exact) return exact;

  return WarehouseInventory.findOne({
    warehouseId,
    sku: { $regex: `^${escapeRegex(key)}$`, $options: "i" },
  });
}

async function getAvailable(warehouseId, sku) {
  const row = await findRow(warehouseId, sku);
  if (!row) return 0;
  return Number(row.quantityAvailable ?? row.quantityOnHand) || 0;
}

async function reserve({ companyId, warehouseId, sku, quantity }) {
  const qty = Number(quantity) || 0;
  const key = normalizeSku(sku);
  if (qty <= 0 || !key) return null;

  const existing = await findRow(warehouseId, key);
  if (!existing) {
    logger.warn({ warehouseId: String(warehouseId), sku: key, quantity: qty }, "Inventory reserve failed — SKU not found");
    return null;
  }

  const row = await WarehouseInventory.findOneAndUpdate(
    {
      _id: existing._id,
      $expr: {
        $gte: [{ $ifNull: ["$quantityAvailable", "$quantityOnHand"] }, qty],
      },
    },
    {
      $inc: { quantityAvailable: -qty, reserved: qty },
    },
    { returnDocument: "after" }
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

  const existing = await findRow(warehouseId, key);
  if (!existing) return null;

  return WarehouseInventory.findOneAndUpdate(
    { _id: existing._id },
    {
      $inc: { quantityAvailable: qty, reserved: -qty },
    },
    { returnDocument: "after" }
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
    { returnDocument: "after" }
  );

  return updated;
}

async function stockMapForWarehouse(warehouseId, skus) {
  const normalized = [...new Set((skus || []).map(normalizeSku).filter(Boolean))];
  if (!normalized.length) return new Map();
  const upper = normalized.map((s) => s.toUpperCase());
  const rows = await WarehouseInventory.find({
    warehouseId,
    $or: [{ sku: { $in: normalized } }, { sku: { $in: upper } }],
  }).lean();
  return new Map(rows.map((r) => [String(r.sku).toUpperCase(), Number(r.quantityAvailable ?? r.quantityOnHand) || 0]));
}

/**
 * Add stock back after a return — always increments the existing SKU row when present.
 */
async function restock({ companyId, warehouseId, sku, quantity }) {
  const qty = Number(quantity) || 0;
  const key = normalizeSku(sku);
  if (qty <= 0 || !key || !warehouseId) return null;

  const existing = await findRow(warehouseId, key);
  if (existing) {
    const row = await WarehouseInventory.findOneAndUpdate(
      { _id: existing._id },
      {
        $inc: {
          quantityOnHand: qty,
          quantityAvailable: qty,
        },
      },
      { returnDocument: "after" }
    );
    logger.info(
      {
        warehouseId: String(warehouseId),
        sku: existing.sku,
        delta: qty,
        onHand: row?.quantityOnHand,
      },
      "Inventory restocked (existing row)"
    );
    return row;
  }

  const row = await WarehouseInventory.create({
    companyId,
    warehouseId,
    sku: key,
    quantityOnHand: qty,
    quantityAvailable: qty,
    reserved: 0,
  });
  logger.info(
    { warehouseId: String(warehouseId), sku: key, delta: qty },
    "Inventory restocked (created row)"
  );
  return row;
}

module.exports = {
  getAvailable,
  reserve,
  release,
  consumeReserved,
  restock,
  stockMapForWarehouse,
  normalizeSku,
  findRow,
};
