const test = require("node:test");
const assert = require("node:assert/strict");
const { recoverMissingSkus } = require("../src/modules/modernwms/orderSku");
const { buildDispatchLines } = require("../src/modules/modernwms/mapper");
const { findDispatchNoAfterCreate } = require("../src/modules/modernwms/mapper");

test("dispatch lookup never selects another order for the same customer", async () => {
  const client = { listDispatches: async () => [
    { dispatch_no: "OTHER", customer_id: 1, customer_name: "QA Customer #10550", create_time: "2026-10-22T02:00:00Z" },
    { dispatch_no: "MATCH", customer_id: 1, customer_name: "QA Customer #1055", create_time: "2026-10-22T01:00:00Z" },
  ] };
  assert.equal(await findDispatchNoAfterCreate(client, 1, "#1055"), "MATCH");
  assert.equal(await findDispatchNoAfterCreate(client, 1, "#999"), "");
});

test("recovers blank group SKU from exact order line or current Shopify variant", async () => {
  const order = { lineItems: [{ id: "1", sku: "SKU-A" }, { id: "2", variantId: "123" }] };
  const group = { lines: [{ orderLineId: "1", quantity: 1 }, { orderLineId: "2", quantity: 2 }] };
  let calls = 0;
  assert.equal(await recoverMissingSkus({ group, order, shop: {}, lookupVariant: async (_, id) => {
    calls++; assert.equal(id, "gid://shopify/ProductVariant/123"); return { sku: "QA-SKU-A" };
  } }), true);
  assert.deepEqual(group.lines.map(l => l.sku), ["SKU-A", "QA-SKU-A"]);
  assert.equal(calls, 1);
});

test("does not guess a SKU from a matching product title", async () => {
  await assert.rejects(recoverMissingSkus({
    group: { lines: [{ orderLineId: "2", title: "SKU-A", quantity: 1 }] },
    order: { orderNumber: "1049", lineItems: [{ id: "1", title: "SKU-A", sku: "SKU-A" }] },
  }), /Missing SKU.*1049.*line 2/);
});

test("zero allocated quantity is not replaced with original ordered quantity", async () => {
  let lookups = 0;
  const lines = await buildDispatchLines({
    client: { getSkuByBarCode: async () => { lookups++; return { sku_id: 22 }; } },
    group: { lines: [{ sku: "QA-SKU-A", allocatedQty: 0, quantity: 10 }, { sku: "SKU-A", allocatedQty: 2, quantity: 5 }] },
    order: {}, warehouse: { modernwms: { defaultCustomerId: 1 } },
  });
  assert.equal(lookups, 1);
  assert.equal(lines[0].qty, 2);
});
