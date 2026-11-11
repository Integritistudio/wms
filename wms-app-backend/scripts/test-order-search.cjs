const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rows = [
  { _id: 'target', shopId: 'demo', orderNumber: '1047', status: 'received', customerName: 'Demo Customer', 'lineItems.sku': 'INT-CAP-NVY-OS' },
  { _id: 'other-tenant', shopId: 'other', orderNumber: '1047', status: 'received' },
  { _id: 'sku', shopId: 'demo', orderNumber: '2000', 'lineItems.sku': '#PART.1', status: 'received' },
  { _id: 'plain-sku', shopId: 'demo', orderNumber: '2001', 'lineItems.sku': 'PART.1', status: 'received' },
  { _id: 'literal', shopId: 'demo', orderNumber: '10.47', status: 'received' },
];
for (const row of rows) row.toPublic = () => ({ id: row._id });
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((clause) => matches(row, clause));
    if (key === '$and') return value.every((clause) => matches(row, clause));
    if (value && typeof value.test === 'function') return value.test(row[key] || '');
    return row[key] === value;
  });
}
const Order = {
  countDocuments: async (filter) => rows.filter((row) => matches(row, filter)).length,
  find(filter) {
    let result = rows.filter((row) => matches(row, filter));
    return { sort() { return this; }, skip(n) { result = result.slice(n); return this; },
      limit(n) { return Promise.resolve(result.slice(0, n)); } };
  },
};
const context = { module: { exports: {} }, require(name) {
  if (name === './model') return Order;
  if (name === '../fulfillment/shipmentModel') return { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  return {};
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/orders/service.js'), 'utf8'), context);
(async () => {
  const search = (q, extra = {}) => context.module.exports.listOrdersFiltered({ shopId: 'demo' }, { q, ...extra });
  for (const q of ['1047', '#1047', '  #1047  ', '# 1047']) {
    const result = await search(q);
    assert.deepEqual(Array.from(result.items, (row) => row.id), ['target']);
    assert.equal(result.total, 1);
  }
  assert.equal((await search('#1047', { status: 'fulfilled' })).total, 0);
  assert.equal((await search('#1047', { page: 2, limit: 1 })).items.length, 0);
  assert.deepEqual(Array.from((await search('#PART.1')).items, (row) => row.id), ['sku']);
  assert.deepEqual(Array.from((await search('#10.47')).items, (row) => row.id), ['literal']);
  assert.equal((await search('#')).total, 1); // Literal # matches SKU, never every order.
  assert.equal((await search('#9999')).total, 0);
  for (const q of ['Demo Customer', 'demo customer', '  Demo Customer  ', 'INT-CAP-NVY-OS']) {
    assert.deepEqual(Array.from((await search(q)).items, row => row.id), ['target']);
  }
  assert.deepEqual(Array.from((await search('104')).items, row => row.id), ['target']);
  for (const q of ['zzzz-nomatch-999', '.*', '{"$ne":null}', '<script>alert(1)</script>']) assert.equal((await search(q)).total, 0);
  console.log('Order search: hash prefix, whitespace, scope, filters, pagination, literal SKU and regex escaping passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
