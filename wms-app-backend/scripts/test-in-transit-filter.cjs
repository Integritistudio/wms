const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const orders = [];
const shipments = [];
function add(id, status, shipmentStatuses, shopId = 'demo', warehouseId = 'main') {
  orders.push({ _id: id, status, shopId, warehouseId, orderNumber: id,
    toPublic() { return { id, status }; } });
  for (const shipmentStatus of shipmentStatuses) shipments.push({ orderId: id, status: shipmentStatus });
}
add('moving', 'fulfilled', ['in_transit']);
add('out', 'fulfilled', ['out_for_delivery']);
add('label', '940_ready', ['labeled']);
add('returned-order', 'returned', ['in_transit']);
add('partial-return', 'partially_returned', ['in_transit']);
add('cancelled', 'cancelled', ['in_transit']);
add('returned-path', 'fulfilled', ['in_transit', 'returned']);
add('delivered-path', 'fulfilled', ['in_transit', 'delivered']);
add('failed-path', 'fulfilled', ['in_transit', 'failed']);
add('pending', 'received', ['pending']);
add('other-tenant', 'fulfilled', ['in_transit'], 'other');
add('other-warehouse', 'fulfilled', ['in_transit'], 'demo', 'other');

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return value.every((clause) => matches(row, clause));
    if (key === '$or') return value.some((clause) => matches(row, clause));
    if (value instanceof RegExp) return value.test(row[key] || '');
    if (value && typeof value === 'object') {
      return (!value.$in || value.$in.includes(row[key])) && (!value.$nin || !value.$nin.includes(row[key]));
    }
    return row[key] === value;
  });
}
const Order = {
  countDocuments: async (filter) => orders.filter((row) => matches(row, filter)).length,
  find(filter) {
    let rows = orders.filter((row) => matches(row, filter));
    return { sort() { return this; }, skip(n) { rows = rows.slice(n); return this; },
      limit(n) { return Promise.resolve(rows.slice(0, n)); } };
  },
};
const Shipment = {
  distinct: async (key, filter) => [...new Set(shipments.filter((row) => matches(row, filter)).map((row) => row[key]))],
  find: (filter) => ({ select: () => ({ lean: async () => shipments.filter((row) => matches(row, filter)) }) }),
};
const context = { module: { exports: {} }, require(name) {
  if (name === './model') return Order;
  if (name === '../fulfillment/shipmentModel') return Shipment;
  return {};
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/orders/service.js'), 'utf8'), context);
const { listOrdersFiltered } = context.module.exports;
(async () => {
  const scope = { shopId: 'demo', warehouseId: 'main' };
  const result = await listOrdersFiltered(scope, { status: 'in_transit' });
  assert.deepEqual(Array.from(result.items, (row) => row.id), ['moving', 'out', 'label']);
  assert.equal(result.total, 3);
  assert.ok(result.items.every((row) => ['in_transit', 'out_for_delivery', 'labeled'].includes(row.shipmentStatus)));
  const page = await listOrdersFiltered(scope, { status: 'in_transit', page: 2, limit: 2 });
  assert.equal(page.total, 3);
  assert.deepEqual(Array.from(page.items, (row) => row.id), ['label']);
  const constrained = await listOrdersFiltered({ ...scope, _id: 'moving' }, { status: 'in_transit' });
  assert.equal(constrained.total, 1);
  const all = await listOrdersFiltered(scope, {});
  assert.equal(all.total, 10);
  console.log('In transit filter: status, split paths, scope, pagination, and unfiltered checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
