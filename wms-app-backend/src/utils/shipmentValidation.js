const { httpError } = require('./httpError');

function validateShipmentLines(quantities, lines, { complete = false } = {}) {
  if (!Array.isArray(quantities)) throw httpError(400, '945 quantities must be a list');
  if (!quantities.length) return;
  const allowed = new Map();
  for (const line of lines || []) {
    const sku = String(line.sku || line.variantSku || '').trim().toUpperCase();
    allowed.set(sku, (allowed.get(sku) || 0) + Number(line.allocatedQty || line.quantity || 0));
  }
  const shipped = new Map();
  for (const line of quantities) {
    const sku = String(line.sku || '').trim().toUpperCase();
    const quantity = Number(line.quantity);
    if (!allowed.has(sku)) throw httpError(400, `945 SKU is not on this order or fulfillment path: ${sku || '(missing)'}`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(400, `945 quantity must be positive for ${sku}`);
    shipped.set(sku, (shipped.get(sku) || 0) + quantity);
    if (shipped.get(sku) > allowed.get(sku)) throw httpError(400, `945 quantity exceeds the allocated quantity for ${sku}`);
  }
  if (complete && [...allowed].some(([sku, quantity]) => shipped.get(sku) !== quantity)) {
    throw httpError(400, '945 must include all allocated quantities for this fulfillment path; split the allocation before shipping a partial path');
  }
}

module.exports = { validateShipmentLines };
