const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rows = Array.from({ length: 54 }, (_, i) => ({
  _id: String(i).padStart(3, '0'), shopId: 'demo', orderNumber: String(1060 - i),
  status: i % 2 ? 'pending' : 'allocated', carrier: i % 2 ? 'UPS' : '',
  toPublic() { return { id: this._id, orderNumber: this.orderNumber, status: this.status, carrier: this.carrier }; },
}));
rows.push({ _id: 'other', shopId: 'other', orderNumber: '1' });
const calls = [];
const Order = {
  countDocuments: async (filter) => rows.filter((r) => r.shopId === filter.shopId).length,
  find(filter) {
    let result = rows.filter((r) => r.shopId === filter.shopId);
    let sort;
    return {
      sort(value) { sort = value; calls.push('sort'); return this; },
      collation(value) {
        assert.equal(value.numericOrdering, true);
        calls.push('collation');
        return this;
      },
      skip(n) {
        calls.push('skip');
        result.sort((a, b) => {
          for (const [key, direction] of Object.entries(sort)) {
            const comparison = String(a[key] || '').localeCompare(String(b[key] || ''), 'en', { numeric: true });
            if (comparison) return comparison * direction;
          }
          return 0;
        });
        result = result.slice(n);
        return this;
      },
      limit(n) { return Promise.resolve(result.slice(0, n)); },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
  },
};
const context = { module: { exports: {} }, require(name) {
  if (name === './model') return Order;
  if (name === '../fulfillment/shipmentModel') return { find: () => ({ select: () => ({ lean: async () => rows.filter(r => r.shopId === 'demo' && !r.carrier).map(r => ({ orderId: r._id, carrier: 'FedEx', status: 'shipped' })) }) }) };
  return {};
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/orders/service.js'), 'utf8'), context);
(async () => {
  const list = (query) => context.module.exports.listOrdersFiltered({ shopId: 'demo' }, query);
  const query = { sortBy: 'orderNumber', sortDir: 'asc', limit: 25 };
  const first = await list({ ...query, page: 1 });
  const second = await list({ ...query, page: 2 });
  assert.equal(first.items[0].orderNumber, '1007');
  assert.equal(first.items[24].orderNumber, '1031');
  assert.equal(second.items[0].orderNumber, '1032');
  assert.equal(first.total, 54);
  assert.deepEqual(calls.slice(0, 3), ['sort', 'collation', 'skip']);
  const descending = await list({ ...query, sortDir: 'desc' });
  assert.equal(descending.items[0].orderNumber, '1060');
  rows.push({ _id: 'low', shopId: 'demo', orderNumber: '999', toPublic: rows[0].toPublic });
  assert.equal((await list(query)).items[0].orderNumber, '999');
  calls.length = 0;
  await list({ sortBy: 'untrustedField' });
  assert.ok(!calls.includes('collation'));
  for (const field of ['status', 'carrier']) {
    for (const sortDir of ['asc', 'desc']) {
      const query = { sortBy: field, sortDir, limit: 25 };
      const pages = await Promise.all([1, 2, 3].map(page => list({ ...query, page })));
      const items = pages.flatMap(page => page.items);
      assert.equal(items.length, 55);
      assert.equal(new Set(items.map(item => item.id)).size, 55);
      for (let i = 1; i < items.length; i++) {
        const comparison = String(items[i - 1][field] || '').localeCompare(String(items[i][field] || ''), 'en', { sensitivity: 'base', numeric: true });
        assert.ok(sortDir === 'asc' ? comparison <= 0 : comparison >= 0, `${field} ${sortDir} across page boundaries`);
      }
      if (field === 'carrier') assert.ok(items.some(item => item.carrier === 'FedEx'), 'shipment carrier fallback included');
    }
  }
  console.log('Order sorting: cross-page ascending/descending, numeric ordering, scope, and fallback passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
