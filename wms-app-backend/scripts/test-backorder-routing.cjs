const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.resolve(__dirname, '../src/modules');
let stock = 0;
let allowed = true;
function stub(file, exports) {
  const id = require.resolve(path.join(base, file));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('routing/inventoryModel', { find: () => ({ lean: async () => [{ sku: 'TEST', quantityAvailable: stock }] }) });
stub('inventorySync/productLinkModel', { find: (filter) => {
  assert.equal(filter.shopId, 'store-1');
  return { lean: async () => allowed ? [{ sku: 'TEST', variantId: 'gid://shopify/ProductVariant/1' }] : [] };
} });
const { evaluateRule, routeOrder } = require(path.join(base, 'routing/engine'));
const rule = { enabled: true, warehouseId: 'warehouse-1', name: 'Backorder', conditions: [{ field: 'backorder_sku', operator: 'equals', value: 'test' }] };
const order = { shopId: 'store-1', lineItems: [{ sku: 'TEST', quantity: 2, variantId: '1' }] };
(async () => {
  assert.equal(await evaluateRule(rule, order), true);
  const result = await routeOrder(order, 'company-1', [rule], { enabled: true });
  assert.equal(result.warehouseId, 'warehouse-1');
  stock = 2;
  assert.equal(await evaluateRule(rule, order), false);
  stock = 0; allowed = false;
  assert.equal(await evaluateRule(rule, order), false);
  allowed = true;
  assert.equal(await evaluateRule(rule, { ...order, shopId: undefined }), false);
  assert.equal(await evaluateRule(rule, { ...order, lineItems: [{ sku: 'OTHER', quantity: 2 }] }), false);
  assert.equal(await evaluateRule(rule, { ...order, lineItems: [{ sku: 'TEST', quantity: 2, variantId: '2' }] }), false);
  assert.equal(await evaluateRule({ ...rule, requireAllItemsInStock: true }, order), false);
  console.log('Backorder routing: 8 checks passed');
})().catch((err) => { console.error(err); process.exitCode = 1; });
