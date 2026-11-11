const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const x12 = require('../src/modules/edi/x12');
const { validateShipmentLines } = require('../src/utils/shipmentValidation');
const { validateTracking } = require('../src/utils/trackingValidation');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

const order = { orderNumber: '1045', shopifyOrderId: 'shopify-id', lineItems: [{ sku: 'IT-01', quantity: 2 }] };
check('TC-062: N9 tracking is not the W06 date', () => {
  const parsed = x12.parseShipment('ST*945*0001~W06*N*1045*20261105*SHIP-1045~N9*CN*1Z999AA10123456784~W12*CC*2*2*0*EA**SK*IT-01~');
  assert.equal(parsed.shipmentId, 'SHIP-1045');
  assert.equal(parsed.trackingNumber, '1Z999AA10123456784');
  assert.deepEqual(parsed.quantities, [{ sku: 'IT-01', quantity: 2 }]);
  assert.equal(x12.parseShipment('N9*CN*1Z999AA10123456784~MAN*GM*PACKAGE-ID~').trackingNumber, '1Z999AA10123456784');
});
check('TC-062: W06 date alone is never a tracking/shipment id', () => {
  assert.equal(x12.parseShipment('W06*N*1045*20261105~').shipmentId, '');
});
check('TC-062/064: sample 945 round trip preserves tracking, quantities and stage', () => {
  const sample = x12.build945({ mapping: {}, order, trackingNumber: '1Z999AA10123456784', carrier: 'UPS' });
  assert.ok(sample.includes('ST*945*'));
  const parsed = x12.parseShipment(sample);
  assert.equal(parsed.trackingNumber, '1Z999AA10123456784');
  assert.equal(parsed.status, 'labeled');
  assert.deepEqual(parsed.quantities, [{ sku: 'IT-01', quantity: 2 }]);
  validateShipmentLines(parsed.quantities, order.lineItems, { complete: true });
});
check('TC-064: 940 includes order and SKU', () => {
  const body = x12.build940({ mapping: {}, order });
  assert.ok(body.includes('ST*940*'));
  assert.ok(body.includes('W05*N*1045*shopify-id'));
  assert.ok(body.includes('IT-01'));
});
check('TC-062: legacy generated W12 remains readable', () => {
  assert.deepEqual(x12.parseShipment('W12*2*EA*IT-01***IT-01~').quantities, [{ sku: 'IT-01', quantity: 2 }]);
});
check('TC-062: unknown SKU rejected', () => {
  assert.throws(() => validateShipmentLines([{ sku: 'WRONG', quantity: 1 }], order.lineItems), /not on this order/);
});
check('TC-062: oversized and duplicate quantities rejected', () => {
  assert.throws(() => validateShipmentLines([{ sku: 'IT-01', quantity: 3 }], order.lineItems), /exceeds/);
  assert.throws(() => validateShipmentLines([{ sku: 'IT-01', quantity: 2 }, { sku: 'IT-01', quantity: 1 }], order.lineItems), /exceeds/);
});
check('TC-062: partial path cannot silently ship all allocated stock', () => {
  assert.throws(() => validateShipmentLines([{ sku: 'IT-01', quantity: 1 }], order.lineItems, { complete: true }), /all allocated/);
});
check('TC-060/061: empty, plain and malformed JSON documents', () => {
  assert.equal(x12.parseShipment('').trackingNumber, '');
  assert.equal(x12.parseShipment('not an edi file').shipmentId, '');
  assert.throws(() => x12.parseShipment('{broken'), error => error.statusCode === 400);
});
check('TC-048/049/052: whitespace, HTML and short tracking rejected', () => {
  for (const tracking of ['  ', '<img src=x onerror=alert(1)>', '123']) {
    assert.throws(() => validateTracking(tracking, 'UPS'), /Invalid tracking/);
  }
});
check('TC-065/066: status aliases preserve transit and delivery distinction', () => {
  assert.equal(x12.parseShipment('AT7*AF~').status, 'in_transit');
  assert.equal(x12.parseShipment('AT7*D1~').status, 'delivered');
  assert.equal(x12.parseShipment('AT7*A9~').status, 'returned');
});

let shipped = false;
let duplicate = false;
let company = 'company';
const context = { module: { exports: {} }, require(name) {
  if (name === '../../utils/httpError') return require('../src/utils/httpError');
  if (name === './returnModel') return { exists: async () => duplicate };
  if (name === './shipmentModel') return { exists: async () => shipped };
  if (name === '../orders/model') return { findById: async () => ({ _id: 'order', shopId: 'shop', status: '940_ready' }) };
  if (name === '../shops') return { getById: async () => ({ companyId: company }) };
  return {};
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/fulfillment/returns.js'), 'utf8'), context);
(async () => {
  const createReturn = payload => context.module.exports.createReturn('company', { orderId: 'order', ...payload });
  for (const reason of ['', '   ']) await assert.rejects(createReturn({ reason }), /Return reason is required/);
  console.log('PASS TC-056: missing/whitespace return reasons rejected'); checks++;
  await assert.rejects(createReturn({ reason: 'Damaged' }), /Ship the order/);
  console.log('PASS TC-058: unshipped order cannot create a return'); checks++;
  shipped = true; duplicate = true;
  await assert.rejects(createReturn({ reason: 'Damaged' }), /Return already created/);
  console.log('PASS TC-057: duplicate return rejected'); checks++;
  duplicate = false; company = 'other';
  await assert.rejects(createReturn({ reason: 'Damaged' }), /Order not found/);
  console.log('PASS returns remain tenant scoped'); checks++;
  let activity = [];
  const savedOrder = { _id: 'order', shopId: 'shop', status: 'error', lastError: 'Missing RT-RULE-SKU', updatedAt: '2026-11-11', toPublic() { return { id: this._id, status: this.status }; } };
  const query = { find: () => ({ sort: async () => [] }) };
  const detail = { module: { exports: {} }, require(name) {
    if (name === '../orders/model') return { findById: async () => savedOrder };
    if (name === '../shops') return { getById: async () => ({ companyId: 'company' }) };
    if (name === '../logs') return { listForOrder: async (id, companyId) => { assert.equal(companyId, 'company'); return [...activity]; } };
    if (['./groupModel', './shipmentModel', './returnModel'].includes(name)) return query;
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/fulfillment/service.js'), 'utf8'), detail);
  const result = await detail.module.exports.getOrderFulfillment('order');
  assert.equal(result.logs[0].message, savedOrder.lastError);
  assert.equal(result.logs[0].meta.source, 'order_snapshot');
  activity = [{ id: 'persisted', message: savedOrder.lastError }];
  assert.equal((await detail.module.exports.getOrderFulfillment('order')).logs.length, 1);
  console.log('PASS TC-043: shop-scoped audit lookup, historical error visibility, no duplicate event'); checks++;
  console.log(`Orders QA: ${checks} groups passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
