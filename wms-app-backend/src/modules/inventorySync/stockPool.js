// A stock unit belongs to a warehouse, never to a store. Each store publishes
// the available stock of its selected warehouses; reservations are already
// deducted from quantityAvailable by fulfillment.
function sumAvailable(rows, warehouseIds) {
  const allowed = new Set(warehouseIds.map(String));
  return rows.reduce((total, row) => {
    if (!allowed.has(String(row.warehouseId))) return total;
    const qty = Number(row.quantityAvailable ?? row.quantityOnHand ?? 0);
    if (!Number.isFinite(qty)) throw new Error(`Invalid WMS quantity for ${row.sku}`);
    return total + Math.max(0, Math.floor(qty));
  }, 0);
}

function locationPools(shop, maps) {
  if (Array.isArray(shop.warehouseIds)) {
    const targets = new Map((shop.retiredInventoryLocations || []).map((id) => [id, []]));
    // Legacy mapped locations are cleared when a store moves to one pooled location.
    for (const map of maps) targets.set(map.locationGid, []);
    if (shop.inventoryLocationGid) targets.set(shop.inventoryLocationGid, [...new Set(shop.warehouseIds.map(String))]);
    return targets;
  }
  const targets = new Map();
  for (const map of maps) {
    const ids = targets.get(map.locationGid) || [];
    targets.set(map.locationGid, [...new Set([...ids, String(map.warehouseId)])]);
  }
  return targets;
}
module.exports = { sumAvailable, locationPools };
