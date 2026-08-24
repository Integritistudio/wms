const WarehouseInventory = require("./inventoryModel");

const ROUTING_FIELDS = [
  { id: "line_item_count", label: "Line Item Count", category: "Order", type: "number" },
  { id: "total_quantity", label: "Total Quantity", category: "Order", type: "number" },
  { id: "unique_sku_count", label: "Unique SKU Count", category: "Order", type: "number" },
  { id: "order_total", label: "Order Total ($)", category: "Order", type: "number" },
  { id: "order_weight", label: "Order Weight (grams)", category: "Order", type: "number" },
  { id: "max_line_quantity", label: "Max Single Line Quantity", category: "Order", type: "number" },
  { id: "min_line_quantity", label: "Min Single Line Quantity", category: "Order", type: "number" },
  { id: "sku_equals", label: "Any SKU Equals", category: "Items", type: "text" },
  { id: "sku_contains", label: "Any SKU Contains", category: "Items", type: "text" },
  { id: "sku_starts_with", label: "Any SKU Starts With", category: "Items", type: "text" },
  { id: "sku_in_list", label: "Any SKU In List", category: "Items", type: "list" },
  { id: "all_skus_in_list", label: "All SKUs In List", category: "Items", type: "list" },
  { id: "has_sku", label: "Order Has SKU", category: "Items", type: "text" },
  { id: "no_sku_in_list", label: "No SKU In List", category: "Items", type: "list" },
  { id: "ship_country", label: "Ship Country Code", category: "Shipping", type: "text" },
  { id: "ship_state", label: "Ship State/Province", category: "Shipping", type: "text" },
  { id: "ship_city", label: "Ship City", category: "Shipping", type: "text" },
  { id: "ship_zip", label: "Ship ZIP/Postal Code", category: "Shipping", type: "text" },
  { id: "is_b2b", label: "Is B2B Order", category: "Order", type: "boolean" },
  { id: "has_po_number", label: "Has PO Number", category: "Order", type: "boolean" },
  { id: "risk_level", label: "Risk Level", category: "Order", type: "text" },
  { id: "is_expedited", label: "Is Expedited Shipping", category: "Shipping", type: "boolean" },
  { id: "shipping_method", label: "Shipping Method Code", category: "Shipping", type: "text" },
  { id: "order_tags", label: "Order Tags", category: "Order", type: "text" },
  { id: "customer_email", label: "Customer Email", category: "Customer", type: "text" },
  { id: "customer_email_domain", label: "Customer Email Domain", category: "Customer", type: "text" },
  { id: "all_items_in_stock", label: "All Items In Stock (target warehouse)", category: "Inventory", type: "inventory" },
  { id: "any_item_in_stock", label: "Any Item In Stock (target warehouse)", category: "Inventory", type: "inventory" },
  { id: "sku_stock_gte", label: "SKU Stock >= (format: SKU:qty)", category: "Inventory", type: "inventory" },
  { id: "warehouse_has_sku", label: "Warehouse Has SKU", category: "Inventory", type: "text" },
];

const OPERATORS = [
  { id: "equals", label: "Equals" },
  { id: "not_equals", label: "Not Equals" },
  { id: "contains", label: "Contains" },
  { id: "not_contains", label: "Does Not Contain" },
  { id: "starts_with", label: "Starts With" },
  { id: "ends_with", label: "Ends With" },
  { id: "greater_than", label: "Greater Than" },
  { id: "less_than", label: "Less Than" },
  { id: "greater_or_equal", label: "Greater Or Equal" },
  { id: "less_or_equal", label: "Less Or Equal" },
  { id: "in_list", label: "In List (comma-separated)" },
  { id: "not_in_list", label: "Not In List" },
  { id: "is_true", label: "Is True" },
  { id: "is_false", label: "Is False" },
  { id: "is_empty", label: "Is Empty" },
  { id: "is_not_empty", label: "Is Not Empty" },
];

function parseList(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getOrderMetrics(order) {
  const lineItems = order.lineItems || [];
  const payload = order.payload || {};
  const quantities = lineItems.map((li) => Number(li.quantity) || 0);
  const skus = lineItems.map((li) => (li.sku || "").trim()).filter(Boolean);
  const tags = (payload.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  const email = order.email || payload.email || "";

  return {
    line_item_count: lineItems.length,
    total_quantity: quantities.reduce((a, b) => a + b, 0),
    unique_sku_count: new Set(skus).size,
    order_total: Number(payload.total_price || payload.current_total_price || 0),
    order_weight: Number(payload.total_weight || 0),
    max_line_quantity: quantities.length ? Math.max(...quantities) : 0,
    min_line_quantity: quantities.length ? Math.min(...quantities) : 0,
    skus,
    lineItems,
    tags,
    ship_country: (order.shippingAddress?.countryCode || "").toUpperCase(),
    ship_state: (order.shippingAddress?.provinceCode || "").toUpperCase(),
    ship_city: (order.shippingAddress?.city || "").toLowerCase(),
    ship_zip: order.shippingAddress?.zip || "",
    is_b2b: !!order.isB2B,
    has_po_number: !!(order.poNumber && order.poNumber.trim()),
    risk_level: (order.riskLevel || "NONE").toUpperCase(),
    is_expedited: !!(order.shippingMethod?.isExpedited),
    shipping_method: order.shippingMethod?.shopifyServiceCode || "",
    order_tags: tags.join(","),
    customer_email: email.toLowerCase(),
    customer_email_domain: email.includes("@") ? email.split("@")[1].toLowerCase() : "",
  };
}

function compareNumeric(actual, expected, operator) {
  const a = Number(actual);
  const b = Number(expected);
  switch (operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "greater_than": return a > b;
    case "less_than": return a < b;
    case "greater_or_equal": return a >= b;
    case "less_or_equal": return a <= b;
    default: return false;
  }
}

function compareText(actual, expected, operator) {
  const a = String(actual ?? "");
  const e = String(expected ?? "");
  switch (operator) {
    case "equals": return a.toLowerCase() === e.toLowerCase();
    case "not_equals": return a.toLowerCase() !== e.toLowerCase();
    case "contains": return a.toLowerCase().includes(e.toLowerCase());
    case "not_contains": return !a.toLowerCase().includes(e.toLowerCase());
    case "starts_with": return a.toLowerCase().startsWith(e.toLowerCase());
    case "ends_with": return a.toLowerCase().endsWith(e.toLowerCase());
    case "in_list": return parseList(e).some((v) => v.toLowerCase() === a.toLowerCase());
    case "not_in_list": return !parseList(e).some((v) => v.toLowerCase() === a.toLowerCase());
    case "is_empty": return a === "";
    case "is_not_empty": return a !== "";
    case "is_true": return a === "true" || a === true;
    case "is_false": return a === "false" || a === false;
    default: return false;
  }
}

async function loadInventoryMap(warehouseId, skus) {
  if (!warehouseId || !skus.length) return new Map();
  const rows = await WarehouseInventory.find({
    warehouseId,
    sku: { $in: skus },
  }).lean();
  return new Map(rows.map((r) => [r.sku.toUpperCase(), r]));
}

async function evaluateInventoryCondition(field, operator, value, metrics, warehouseId) {
  const invMap = await loadInventoryMap(warehouseId, metrics.skus);

  if (field === "all_items_in_stock") {
    if (!metrics.lineItems.length) return operator === "is_false";
    return metrics.lineItems.every((li) => {
      const sku = (li.sku || "").toUpperCase();
      const inv = invMap.get(sku);
      const needed = Number(li.quantity) || 0;
      return inv && (inv.quantityAvailable ?? inv.quantityOnHand) >= needed;
    });
  }

  if (field === "any_item_in_stock") {
    return metrics.lineItems.some((li) => {
      const sku = (li.sku || "").toUpperCase();
      const inv = invMap.get(sku);
      const needed = Number(li.quantity) || 0;
      return inv && (inv.quantityAvailable ?? inv.quantityOnHand) >= needed;
    });
  }

  if (field === "sku_stock_gte") {
    const [skuPart, qtyPart] = (value || "").split(":");
    const sku = (skuPart || "").trim().toUpperCase();
    const minQty = Number(qtyPart) || 0;
    const inv = invMap.get(sku);
    const available = inv ? (inv.quantityAvailable ?? inv.quantityOnHand) : 0;
    return compareNumeric(available, minQty, operator || "greater_or_equal");
  }

  if (field === "warehouse_has_sku") {
    const sku = (value || "").trim().toUpperCase();
    const inv = invMap.get(sku);
    if (operator === "is_not_empty") return !!inv;
    return compareNumeric(inv ? (inv.quantityAvailable ?? inv.quantityOnHand) : 0, 1, "greater_or_equal");
  }

  return false;
}

async function evaluateCondition(condition, metrics, warehouseId) {
  const { field, operator, value } = condition;

  if (field === "sku_equals") {
    return metrics.skus.some((s) => compareText(s, value, operator));
  }
  if (field === "sku_contains") {
    return metrics.skus.some((s) => compareText(s, value, "contains"));
  }
  if (field === "sku_starts_with") {
    return metrics.skus.some((s) => compareText(s, value, "starts_with"));
  }
  if (field === "sku_in_list") {
    const list = parseList(value).map((s) => s.toUpperCase());
    return metrics.skus.some((s) => list.includes(s.toUpperCase()));
  }
  if (field === "all_skus_in_list") {
    const list = parseList(value).map((s) => s.toUpperCase());
    if (!metrics.skus.length) return false;
    return metrics.skus.every((s) => list.includes(s.toUpperCase()));
  }
  if (field === "has_sku") {
    return metrics.skus.some((s) => compareText(s, value, "equals"));
  }
  if (field === "no_sku_in_list") {
    const list = parseList(value).map((s) => s.toUpperCase());
    return !metrics.skus.some((s) => list.includes(s.toUpperCase()));
  }

  if (["all_items_in_stock", "any_item_in_stock", "sku_stock_gte", "warehouse_has_sku"].includes(field)) {
    return evaluateInventoryCondition(field, operator, value, metrics, warehouseId);
  }

  if (field === "is_b2b" || field === "has_po_number" || field === "is_expedited") {
    const boolVal = metrics[field];
    if (operator === "is_true") return boolVal === true;
    if (operator === "is_false") return boolVal === false;
    return compareText(String(boolVal), value, operator);
  }

  if (field === "order_tags") {
    const tagStr = metrics.tags.join(",");
    if (operator === "contains") return metrics.tags.some((t) => compareText(t, value, "contains"));
    return compareText(tagStr, value, operator);
  }

  const numericFields = [
    "line_item_count",
    "total_quantity",
    "unique_sku_count",
    "order_total",
    "order_weight",
    "max_line_quantity",
    "min_line_quantity",
  ];

  if (numericFields.includes(field)) {
    return compareNumeric(metrics[field], value, operator);
  }

  const textVal = metrics[field];
  if (field === "ship_country" || field === "ship_state") {
    return compareText(textVal, value.toUpperCase(), operator === "in_list" ? "in_list" : operator);
  }
  return compareText(textVal, value, operator);
}

async function evaluateRule(rule, order) {
  if (!rule.enabled) return false;

  const metrics = getOrderMetrics(order);
  const warehouseId = rule.warehouseId;

  if (rule.requireAllItemsInStock) {
    const stockOk = await evaluateInventoryCondition("all_items_in_stock", "is_true", "", metrics, warehouseId);
    if (!stockOk) return false;
  }

  if (!rule.conditions || rule.conditions.length === 0) {
    return true;
  }

  const results = await Promise.all(
    rule.conditions.map((c) => evaluateCondition(c, metrics, warehouseId))
  );

  return rule.conditionLogic === "or" ? results.some(Boolean) : results.every(Boolean);
}

async function routeOrder(order, companyId, rules, config, warehouses = []) {
  if (!config?.enabled) return null;

  for (const rule of rules) {
    const matched = await evaluateRule(rule, order);
    if (matched) {
      return {
        warehouseId: rule.warehouseId,
        ruleId: rule._id,
        ruleName: rule.name,
        reason: `Matched rule: ${rule.name}`,
        fallbackWarehouseId: config.fallbackWarehouseId || null,
      };
    }
  }

  const addressMode = config.addressMode || "off";
  if (addressMode !== "off" && warehouses.length) {
    const mapbox = require("./mapbox");
    let best = null;

    if (addressMode === "zip_prefix") {
      const zip = order.shippingAddress?.zip || "";
      const matches = warehouses.filter((w) => mapbox.zipMatchesPrefixes(zip, w.zipPrefixes || []));
      const pool = matches.length ? matches : warehouses;
      pool.sort((a, b) => (Number(a.routingPriority) || 100) - (Number(b.routingPriority) || 100));
      best = pool[0] || null;
      if (best) {
        return {
          warehouseId: best._id,
          ruleId: null,
          ruleName: null,
          reason: matches.length
            ? `Address ZIP match → ${best.name}`
            : `No ZIP match — highest priority warehouse ${best.name}`,
          fallbackWarehouseId: config.fallbackWarehouseId || null,
        };
      }
    }

    if (addressMode === "mapbox_distance") {
      const shipPoint = await mapbox.geocode(mapbox.buildShipQuery(order));
      if (shipPoint) {
        const scored = [];
        for (const wh of warehouses) {
          let lat = wh.latitude;
          let lng = wh.longitude;
          if ((lat == null || lng == null) && wh.address) {
            const geo = await mapbox.geocode(wh.address);
            if (geo) {
              lat = geo.lat;
              lng = geo.lng;
            }
          }
          const distance = mapbox.haversineKm(shipPoint, { lat, lng });
          scored.push({
            wh,
            distance: distance == null ? Number.POSITIVE_INFINITY : distance,
            priority: Number(wh.routingPriority) || 100,
          });
        }
        scored.sort((a, b) => {
          if (a.distance !== b.distance) return a.distance - b.distance;
          return a.priority - b.priority;
        });
        best = scored[0]?.wh || null;
        if (best && Number.isFinite(scored[0].distance)) {
          return {
            warehouseId: best._id,
            ruleId: null,
            ruleName: null,
            reason: `Nearest warehouse (Mapbox): ${best.name} (~${scored[0].distance.toFixed(1)} km)`,
            fallbackWarehouseId: config.fallbackWarehouseId || null,
          };
        }
      }
    }
  }

  if (config.defaultWarehouseId) {
    return {
      warehouseId: config.defaultWarehouseId,
      ruleId: null,
      ruleName: null,
      reason: "Default warehouse",
      fallbackWarehouseId: config.fallbackWarehouseId || null,
    };
  }

  if (config.fallbackWarehouseId) {
    return {
      warehouseId: config.fallbackWarehouseId,
      ruleId: null,
      ruleName: null,
      reason: "Fallback warehouse",
      fallbackWarehouseId: null,
    };
  }

  return null;
}

module.exports = {
  ROUTING_FIELDS,
  OPERATORS,
  getOrderMetrics,
  evaluateRule,
  routeOrder,
};
