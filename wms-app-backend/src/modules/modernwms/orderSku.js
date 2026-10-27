function lineId(value) {
  return String(value || "").split("/").pop();
}

async function recoverMissingSkus({ group, order, shop, lookupVariant }) {
  let changed = false;
  const cache = new Map();
  for (const line of group.lines || []) {
    if (String(line.sku || "").trim() || Number(line.allocatedQty ?? line.quantity ?? 0) <= 0) continue;
    const id = lineId(line.orderLineId);
    // Only recover by exact line identity, never by title or array position.
    const original = id && (order.lineItems || []).find(item => lineId(item.id) === id);
    const raw = id && (order.payload?.line_items || []).find(item => lineId(item.id) === id);
    let sku = String(original?.sku || raw?.sku || "").trim();
    const variantId = original?.variantId || raw?.variant_id;
    if (!sku && variantId && shop && lookupVariant) {
      const key = lineId(variantId);
      if (!cache.has(key)) cache.set(key, await lookupVariant(shop, `gid://shopify/ProductVariant/${key}`));
      sku = String(cache.get(key)?.sku || "").trim();
    }
    if (!sku) {
      throw new Error(`Missing SKU for order #${order.orderNumber || order.shopifyOrderId}, line ${id || "unknown"} (${line.title || original?.title || "untitled"}). Set the Shopify variant SKU to the matching ModernWMS SKU, then retry. Product titles are not SKUs.`);
    }
    line.sku = sku;
    changed = true;
  }
  return changed;
}

module.exports = { recoverMissingSkus };
