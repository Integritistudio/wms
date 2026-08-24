const Warehouse = require("../companies/warehouseModel");
const FulfillmentGroup = require("./groupModel");
const inventory = require("./inventory");
const routing = require("../routing");
const mapbox = require("../routing/mapbox");
const WarehouseInventory = require("../routing/inventoryModel");

function enrichLineItems(lineItems = []) {
  return (lineItems || []).map((item, idx) => ({
    id: String(item.id || `line-${idx}`),
    sku: item.sku || "",
    title: item.title || "",
    quantity: Number(item.quantity) || 0,
    variantId: item.variantId || "",
    status: item.status || "open",
    allocatedQty: Number(item.allocatedQty) || 0,
    shippedQty: Number(item.shippedQty) || 0,
    backorderedQty: Number(item.backorderedQty) || 0,
    serials: item.serials || [],
    lot: item.lot || "",
    expiry: item.expiry || null,
    fulfillmentOrderLineItemGid: item.fulfillmentOrderLineItemGid || "",
    wmsUom: item.wmsUom || "EA",
  }));
}

function remainingNeed(line) {
  const qty = Number(line.quantity) || 0;
  const allocated = Number(line.allocatedQty) || 0;
  const shipped = Number(line.shippedQty) || 0;
  return Math.max(0, qty - Math.max(allocated, shipped));
}

function usableStock(available, threshold) {
  const avail = Math.max(0, Number(available) || 0);
  const min = Math.max(0, Number(threshold) || 0);
  // If stock is at/below threshold, treat as unavailable so system looks elsewhere
  if (min > 0 && avail <= min) return 0;
  return avail;
}

async function canFulfillAll(warehouseId, lines, threshold = 0) {
  const skus = lines.map((l) => l.sku).filter(Boolean);
  const stock = await inventory.stockMapForWarehouse(warehouseId, skus);
  return lines.every((line) => {
    const need = remainingNeed(line);
    if (need <= 0) return true;
    if (!line.sku) return true;
    const available = usableStock(stock.get(line.sku.toUpperCase()) || 0, threshold);
    return available >= need;
  });
}

async function takeFromWarehouse(warehouseId, lines, threshold = 0) {
  const skus = lines.map((l) => l.sku).filter(Boolean);
  const stock = await inventory.stockMapForWarehouse(warehouseId, skus);
  const taken = [];

  for (const line of lines) {
    const need = remainingNeed(line);
    if (need <= 0) continue;
    if (!line.sku) {
      taken.push({ ...line, allocate: need });
      continue;
    }
    const raw = stock.get(line.sku.toUpperCase()) || 0;
    const available = usableStock(raw, threshold);
    const qty = Math.min(need, available);
    if (qty > 0) {
      taken.push({ ...line, allocate: qty });
      stock.set(line.sku.toUpperCase(), raw - qty);
    }
  }

  return taken;
}

async function rankWarehouses(warehouses, order, config, preferredId) {
  const mode = config.addressMode || "off";
  const shipZip = order.shippingAddress?.zip || "";
  let shipPoint = null;

  if (mode === "mapbox_distance") {
    const query = mapbox.buildShipQuery(order);
    shipPoint = await mapbox.geocode(query);
    // Ensure warehouses have coordinates when possible
    for (const wh of warehouses) {
      if ((wh.latitude == null || wh.longitude == null) && wh.address) {
        const geo = await mapbox.geocode(wh.address);
        if (geo) {
          wh.latitude = geo.lat;
          wh.longitude = geo.lng;
          Warehouse.updateOne(
            { _id: wh._id },
            { $set: { latitude: geo.lat, longitude: geo.lng, geoPlaceName: geo.placeName || "" } }
          ).catch(() => {});
        }
      }
    }
  }

  const scored = warehouses.map((wh) => {
    const id = String(wh._id);
    const priority = Number(wh.routingPriority) || 100;
    let zipScore = 1; // 0 = match (better)
    if (mode === "zip_prefix") {
      zipScore = mapbox.zipMatchesPrefixes(shipZip, wh.zipPrefixes || []) ? 0 : 1;
    }
    let distance = Number.POSITIVE_INFINITY;
    if (mode === "mapbox_distance" && shipPoint) {
      const d = mapbox.haversineKm(shipPoint, { lat: wh.latitude, lng: wh.longitude });
      distance = d == null ? Number.POSITIVE_INFINITY : d;
    }
    const preferredBoost = preferredId && id === preferredId ? -100000 : 0;
    return { wh, id, priority, zipScore, distance, preferredBoost };
  });

  scored.sort((a, b) => {
    if (a.preferredBoost !== b.preferredBoost) return a.preferredBoost - b.preferredBoost;
    if (mode === "zip_prefix" && a.zipScore !== b.zipScore) return a.zipScore - b.zipScore;
    if (mode === "mapbox_distance" && a.distance !== b.distance) return a.distance - b.distance;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return String(a.wh.name || "").localeCompare(String(b.wh.name || ""));
  });

  return scored.map((s) => s.wh);
}

/**
 * Build allocation plan: warehouseId -> [{ line, allocate }]
 * Prefer routing-chosen warehouse; spill by address mode + warehouse priority + stock thresholds.
 */
async function planAllocation(order, companyId, { forceWarehouseId } = {}) {
  const config = await routing.getConfig(companyId);
  const partialPolicy = config.partialPolicy || "ship_available";
  const lines = enrichLineItems(order.lineItems).map((l) => ({
    ...l,
    allocatedQty: 0,
  }));

  const warehouses = await Warehouse.find({ companyId, isActive: { $ne: false } }).lean();
  const plan = new Map();

  let preferredId = forceWarehouseId || null;
  let fallbackId = config.fallbackWarehouseId ? String(config.fallbackWarehouseId) : null;
  let routeReason = "";

  if (!preferredId && config.enabled) {
    const routed = await routing.resolveForOrder(order, companyId);
    preferredId = routed?.warehouseId ? String(routed.warehouseId) : null;
    if (routed?.fallbackWarehouseId) fallbackId = String(routed.fallbackWarehouseId);
    routeReason = routed?.reason || "";
  }
  if (!preferredId && config.defaultWarehouseId) {
    preferredId = String(config.defaultWarehouseId);
    routeReason = routeReason || "Default warehouse";
  }

  const thresholdFor = (whId) => {
    const wh = warehouses.find((w) => String(w._id) === String(whId));
    return Number(wh?.minStockThreshold) || 0;
  };

  const tryWarehouse = async (whId) => {
    const taken = await takeFromWarehouse(whId, lines, thresholdFor(whId));
    if (!taken.length) return;
    for (const t of taken) {
      const line = lines.find((l) => l.id === t.id);
      if (line) line.allocatedQty += t.allocate;
    }
    const key = String(whId);
    const existing = plan.get(key) || [];
    plan.set(key, existing.concat(taken));
  };

  if (preferredId) {
    const full = await canFulfillAll(preferredId, lines, thresholdFor(preferredId));
    if (full || partialPolicy !== "hold_all") {
      await tryWarehouse(preferredId);
    }
  }

  const stillNeed = () => lines.some((l) => remainingNeed(l) > 0);

  if (stillNeed() && partialPolicy !== "hold_all") {
    const ranked = await rankWarehouses(warehouses, order, config, preferredId);
    for (const wh of ranked) {
      if (!stillNeed()) break;
      if (preferredId && String(wh._id) === preferredId) continue;
      await tryWarehouse(wh._id);
    }
  }

  // Explicit fallback warehouse last chance if still short
  if (stillNeed() && partialPolicy !== "hold_all" && fallbackId) {
    const already = plan.has(fallbackId);
    if (!already) {
      await tryWarehouse(fallbackId);
    }
  }

  // Mark backorders
  for (const line of lines) {
    const need = remainingNeed(line);
    line.backorderedQty = need;
    if (need > 0 && line.allocatedQty > 0) line.status = "partial";
    else if (need > 0) line.status = "backorder";
    else if (line.allocatedQty > 0) line.status = "allocated";
  }

  if (partialPolicy === "hold_all" && lines.some((l) => remainingNeed(l) > 0)) {
    return {
      plan,
      lines,
      hold: true,
      reason: "hold_all — incomplete inventory",
      config,
      routeReason,
    };
  }

  // If no inventory rows exist at all, fall back to single preferred/default warehouse with full lines
  const anyInventory = await WarehouseInventory.exists({ companyId });
  if (!plan.size && !anyInventory) {
    const whId = preferredId || fallbackId || (warehouses[0] ? String(warehouses[0]._id) : null);
    if (whId) {
      const fullLines = lines.map((l) => {
        l.allocatedQty = l.quantity;
        l.backorderedQty = 0;
        l.status = "allocated";
        return { ...l, allocate: l.quantity };
      });
      plan.set(whId, fullLines);
      return {
        plan,
        lines,
        hold: false,
        reason: "no inventory records — assigned preferred/default warehouse",
        config,
        routeReason,
      };
    }
  }

  return {
    plan,
    lines,
    hold: false,
    reason: routeReason || (plan.size ? "allocated" : "no stock"),
    config,
    routeReason,
  };
}

async function createGroupsFromPlan(order, shop, planResult) {
  const groups = [];
  for (const [warehouseId, taken] of planResult.plan.entries()) {
    const group = await FulfillmentGroup.create({
      orderId: order._id,
      companyId: shop.companyId,
      shopId: shop._id,
      warehouseId,
      status: "allocated",
      method: "warehouse",
      lines: taken.map((t) => ({
        orderLineId: t.id,
        sku: t.sku,
        title: t.title,
        quantity: t.quantity,
        allocatedQty: t.allocate,
        serials: t.serials || [],
        lot: t.lot || "",
        expiry: t.expiry || null,
      })),
    });
    for (const t of taken) {
      if (!t.sku || !t.allocate) continue;
      await inventory.reserve({
        companyId: shop.companyId,
        warehouseId,
        sku: t.sku,
        quantity: t.allocate,
      });
    }
    groups.push(group);
  }
  return groups;
}

async function releaseGroups(groups) {
  for (const group of groups || []) {
    for (const line of group.lines || []) {
      if (!line.sku) continue;
      const qty = line.allocatedQty || line.quantity || 0;
      if (qty <= 0 || !group.warehouseId) continue;
      await inventory.release({
        warehouseId: group.warehouseId,
        sku: line.sku,
        quantity: qty,
      }).catch(() => {});
    }
  }
}

module.exports = {
  enrichLineItems,
  remainingNeed,
  planAllocation,
  createGroupsFromPlan,
  releaseGroups,
  canFulfillAll,
  takeFromWarehouse,
  rankWarehouses,
};
