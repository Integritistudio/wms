const DISPATCH_STATUS_LABELS = {
  0: "Pre-shipment draft",
  1: "New shipment",
  2: "Goods to be picked",
  3: "Picked",
  4: "Packaged",
  5: "Weighed",
  6: "Out of warehouse",
  7: "Signed in",
};

function dispatchStatusLabel(status) {
  return DISPATCH_STATUS_LABELS[Number(status)] || `Status ${status}`;
}

function customerLabel(order) {
  const name = order.customerName || "Customer";
  const num = order.orderNumber || order.shopifyOrderId || "";
  return `${name} · #${num}`;
}

async function resolveSku(client, sku) {
  const barCode = String(sku || "").trim();
  if (!barCode) {
    throw new Error("Missing SKU on order line");
  }
  const detail = await client.getSkuByBarCode(barCode);
  const skuId = Number(detail?.id || detail?.sku_id || 0);
  if (!skuId) {
    throw new Error(`SKU not found in ModernWMS: ${barCode}`);
  }
  return { skuId, barCode };
}

async function buildDispatchLines({ client, group, order, warehouse }) {
  const cfg = warehouse.modernwms || {};
  const customerId = Number(cfg.defaultCustomerId || 0);
  if (!customerId) {
    throw new Error("ModernWMS defaultCustomerId is required on warehouse config");
  }

  const customerName = customerLabel(order);
  const lines = [];
  const missing = [];

  for (const line of group.lines || []) {
    const qty = Number(line.allocatedQty || line.quantity || 0);
    if (qty <= 0) continue;
    try {
      const { skuId } = await resolveSku(client, line.sku);
      lines.push({
        customer_id: customerId,
        customer_name: customerName,
        sku_id: skuId,
        qty,
        weight: 0,
        volume: 0,
      });
    } catch (error) {
      missing.push({ sku: line.sku, error: error.message });
    }
  }

  if (missing.length) {
    const msg = missing.map((m) => `${m.sku}: ${m.error}`).join("; ");
    throw new Error(msg);
  }
  if (!lines.length) {
    throw new Error("No dispatch lines to push");
  }
  return lines;
}

async function findDispatchNoAfterCreate(client, customerId, marker) {
  const rows = await client.listDispatches({
    pageIndex: 1,
    pageSize: 30,
    searchObjects: customerId
      ? [{ name: "customer_id", value: customerId, text: String(customerId) }]
      : [],
  });
  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.create_time || a.last_update_time || 0).getTime();
    const tb = new Date(b.create_time || b.last_update_time || 0).getTime();
    return tb - ta;
  });
  const match = sorted.find((row) => {
    if (marker && row.customer_name && String(row.customer_name).includes(marker)) {
      return true;
    }
    return Number(row.customer_id) === Number(customerId);
  });
  return match?.dispatch_no || sorted[0]?.dispatch_no || "";
}

module.exports = {
  DISPATCH_STATUS_LABELS,
  dispatchStatusLabel,
  buildDispatchLines,
  findDispatchNoAfterCreate,
  customerLabel,
  resolveSku,
};
