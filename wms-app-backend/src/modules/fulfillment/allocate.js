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

  const unknownSkus = await findUnknownSkus(companyId, lines);
  const unknownSet = new Set(unknownSkus.map((s) => String(s).trim().toUpperCase()));

  // Only hard-fail when *every* SKU is missing from the catalog.
  // With ship_available, known SKUs should still allocate; unknown lines become backorders.
  if (unknownSkus.length && !forceWarehouseId) {
    const hasKnownSku = lines.some((l) => {
      const sku = String(l.sku || "").trim().toUpperCase();
      return sku && !unknownSet.has(sku);
    });
    if (!hasKnownSku) {
      return {
        plan: new Map(),
        lines,
        hold: false,
        missingSkus: unknownSkus,
        reason: `Product not found in warehouse inventory: ${unknownSkus.join(", ")}`,
        config: await routing.getConfig(companyId),
        routeReason: "",
      };
    }
  }

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
    // Default is already applied inside routeOrder when enabled; do not double-apply here
  } else if (!preferredId && !config.enabled) {
    // Routing off: only forceWarehouseId (manual assign) may pick a warehouse
    preferredId = null;
  }

  // When caller forced a warehouse, reason stays empty unless set by caller
  if (forceWarehouseId && !routeReason) {
    routeReason = "USER_ASSIGNED";
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

  /** Force remaining demand onto one warehouse (manual assign / DLQ reassign). */
  const forceRemainingToWarehouse = (whId) => {
    const remaining = [];
    for (const line of lines) {
      const need = remainingNeed(line);
      if (need <= 0) continue;
      // Do not force-allocate SKUs that are not in the inventory catalog.
      const sku = String(line.sku || "").trim().toUpperCase();
      if (sku && unknownSet.has(sku) && !forceWarehouseId) continue;
      remaining.push({ ...line, allocate: need });
      line.allocatedQty += need;
    }
    if (!remaining.length) return;
    const key = String(whId);
    const existing = plan.get(key) || [];
    plan.set(key, existing.concat(remaining));
  };

  if (preferredId) {
    const full = await canFulfillAll(preferredId, lines, thresholdFor(preferredId));
    if (full || partialPolicy !== "hold_all" || forceWarehouseId) {
      await tryWarehouse(preferredId);
    }
  }

  const stillNeed = () => lines.some((l) => remainingNeed(l) > 0);

  // Manual assign: keep the order on the chosen warehouse (no spill / fallback).
  if (forceWarehouseId && stillNeed()) {
    forceRemainingToWarehouse(forceWarehouseId);
  } else if (stillNeed() && partialPolicy !== "hold_all") {
    const ranked = await rankWarehouses(warehouses, order, config, preferredId);
    for (const wh of ranked) {
      if (!stillNeed()) break;
      if (preferredId && String(wh._id) === preferredId) continue;
      await tryWarehouse(wh._id);
    }
  }

  // Explicit fallback warehouse last chance if still short (auto-routing only)
  if (!forceWarehouseId && stillNeed() && partialPolicy !== "hold_all" && fallbackId) {
    const already = plan.has(fallbackId);
    if (!already) {
      await tryWarehouse(fallbackId);
    }
  }

  // Mark backorders (unknown catalog SKUs always backorder unless force-assigned)
  for (const line of lines) {
    const sku = String(line.sku || "").trim().toUpperCase();
    const need = remainingNeed(line);
    line.backorderedQty = need;
    if (sku && unknownSet.has(sku) && need > 0) line.status = "backorder";
    else if (need > 0 && line.allocatedQty > 0) line.status = "partial";
    else if (need > 0) line.status = "backorder";
    else if (line.allocatedQty > 0) line.status = "allocated";
  }

  if (partialPolicy === "hold_all" && !forceWarehouseId && lines.some((l) => remainingNeed(l) > 0)) {
    return {
      plan,
      lines,
      hold: true,
      reason: unknownSkus.length
        ? `hold_all — incomplete inventory (missing: ${unknownSkus.join(", ")})`
        : "hold_all — incomplete inventory",
      config,
      routeReason,
      missingSkus: unknownSkus,
    };
  }

  // Do not silently assign a warehouse when SKUs are not in inventory.
  const anyInventory = await WarehouseInventory.exists({ companyId });
  if (!plan.size && !anyInventory && !forceWarehouseId) {
    const skus = [...new Set(lines.map((l) => String(l.sku || "").trim()).filter(Boolean))];
    return {
      plan,
      lines,
      hold: false,
      missingSkus: skus,
      reason: skus.length
        ? `Product not found in warehouse inventory: ${skus.join(", ")}`
        : "no stock",
      config,
      routeReason,
    };
  }

  if (!plan.size && config.enabled && !forceWarehouseId && !preferredId && !fallbackId) {
    return {
      plan,
      lines,
      hold: false,
      noRouteMatch: true,
      reason: "No warehouse matched routing rules and no default/fallback is configured",
      config,
      routeReason,
    };
  }

  let reason = routeReason || (plan.size ? "allocated" : "no stock");
  if (unknownSkus.length && plan.size) {
    reason = `${reason}; backordered missing SKUs: ${unknownSkus.join(", ")}`;
  }

  return {
    plan,
    lines,
    hold: false,
    reason,
    config,
    routeReason,
    missingSkus: plan.size ? [] : unknownSkus,
    unknownSkus,
    noRouteMatch: Boolean(config.enabled && !forceWarehouseId && !plan.size && !preferredId),
  };
}

async function findUnknownSkus(companyId, lines) {
  const skus = [...new Set((lines || []).map((l) => String(l.sku || "").trim()).filter(Boolean))];
  if (!skus.length) return [];
  const variants = [...new Set(skus.flatMap((sku) => [sku, sku.toUpperCase(), sku.toLowerCase()]))];
  const rows = await WarehouseInventory.find({
    companyId,
    $or: [
      { sku: { $in: variants } },
      ...skus.map((sku) => ({
        sku: { $regex: `^${String(sku).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      })),
    ],
  })
    .select("sku")
    .lean();
  const found = new Set(rows.map((r) => String(r.sku || "").toUpperCase()));
  return skus.filter((sku) => !found.has(sku.toUpperCase()));
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
  enrichLineItems: enrichLineItems,
  remainingNeed,
  remainingNeed: remainingNeed,
  planAllocation,
  planAllocation: planAllocation,
  createGroupsFromPlan,
  createGroupsFromPlan: createGroupsFromPlan,
  releaseGroups,
  releaseGroups: releaseGroups,
  canFulfillAll,
  takeFromWarehouse,
  rankWarehouses,
  findUnknownSkus,
};
