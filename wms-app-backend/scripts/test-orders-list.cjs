const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rows = [];
for (const [status, count] of [['940_ready', 22], ['fulfilled', 5], ['error', 5], ['returned', 16], ['partially_fulfilled', 1]]) {
  for (let i = 0; i < count; i++) {
    const id = `order-${rows.length}`;
    rows.push({ _id: id, shopId: 'demo', status, orderNumber: String(1007 + rows.length),
      warehouseId: status === 'error' ? null : i % 2 ? 'test' : 'main',
      toPublic() { return { id: this._id, status: this.status, orderNumber: this.orderNumber }; },
    });
  }
}
rows.push({ _id: 'foreign', shopId: 'other', status: 'error', warehouseId: 'main' });
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return value.every(clause => matches(row, clause));
    if (key === '$or') return value.some(clause => matches(row, clause));
    if (value && typeof value.test === 'function') return value.test(row[key] || '');
    if (value && typeof value === 'object') return (!value.$in || value.$in.includes(row[key])) && (!value.$nin || !value.$nin.includes(row[key])) && (!Object.hasOwn(value, '$ne') || row[key] !== value.$ne) && (!Object.hasOwn(value, '$exists') || Object.hasOwn(row, key) === value.$exists);
    return row[key] === value;
  });
}
const Order = {
  countDocuments: async filter => rows.filter(row => matches(row, filter)).length,
  find(filter) {
    let result = rows.filter(row => matches(row, filter));
    return {
      sort(fields) { result.sort((a, b) => { for (const [key, direction] of Object.entries(fields)) { const c = String(a[key] || '').localeCompare(String(b[key] || ''), 'en', { numeric: true }); if (c) return c * direction; } return 0; }); return this; },
      collation() { return this; }, select() { return this; }, lean: async () => result,
      skip(n) { result = result.slice(n); return this; }, limit: async n => result.slice(0, n),
    };
  },
};
const context = { module: { exports: {} }, require(name) {
  if (name === './model') return Order;
  if (name === '../fulfillment/shipmentModel') return { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  if (name === '../fulfillment/returnModel') return { distinct: async () => [] };
  return {};
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/orders/service.js'), 'utf8'), context);
(async () => {
  const list = query => context.module.exports.listOrdersFiltered({ shopId: 'demo' }, query);
  const expected = { received: 0, allocated: 22, partially_fulfilled: 1, fulfilled: 5, returns: 16, error: 5, on_hold: 0 };
  const all = await list({});
  assert.equal(all.total, 49); assert.equal(all.items.length, 25);
  let sum = 0;
  for (const [status, total] of Object.entries(expected)) {
    const result = await list({ status });
    assert.equal(result.total, total, status);
    sum += total;
  }
  assert.equal(sum, all.total);
  assert.equal((await list({ page: 2 })).items.length, 24);
  assert.equal((await list({ limit: 50 })).items.length, 49);
  assert.equal((await list({ limit: 25 })).items.length, 25);
  const warehouse = await list({ warehouseId: 'main', limit: 100 });
  assert.ok(warehouse.items.every(item => rows.find(row => row._id === item.id).warehouseId === 'main'));
  assert.equal((await list({ warehouseId: 'unassigned' })).total, 5);
  assert.equal((await list({ status: 'error', warehouseId: 'unassigned' })).total, 5);
  assert.equal((await list({ status: 'error', warehouseId: 'test' })).total, 0);
  assert.equal((await list({ shopId: 'other' })).total, 0);
  assert.equal((await list({ shopId: 'demo', warehouseId: 'main' })).total, warehouse.total);
  assert.equal((await context.module.exports.listOrdersFiltered({ shopId: 'demo', warehouseId: { $in: ['main'] } }, { warehouseId: 'test' })).total, 0);
  assert.equal((await list({})).total, 49);
  console.log('Orders list: fixture counts, every exclusive status, KPI totals, 25/50 pagination, warehouse/store intersections, clearing and tenant/warehouse scope passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
