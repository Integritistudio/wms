const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateTracking } = require('../src/utils/trackingValidation');
for (const [carrier, tracking] of [['UPS', '1Z999AA10123456784'], ['FedEx', '123456789012'], ['USPS', '9400111899223856928499'], ['DHL', '1234567890']]) {
  assert.equal(validateTracking(tracking, carrier).trackingNumber, tracking);
  assert.throws(() => validateTracking('123', carrier), /Invalid tracking/);
}
assert.throws(() => validateTracking('1Z999AA10123456784', ''), /Carrier is required/);

let activeReturn = false;
let createdGroup;
let shipCall;
const order = { _id: 'order', shopId: 'shop', warehouseId: 'warehouse', status: 'allocated', orderNumber: '1046', lineItems: [{ id: 'line', sku: 'sku', quantity: 1 }] };
const context = { module: { exports: {} }, require(name) {
  if (name === '../../utils/httpError') return require('../src/utils/httpError');
  if (name === '../../utils/trackingValidation') return { validateTracking };
  if (name === '../../utils/shipmentValidation') return require('../src/utils/shipmentValidation');
  if (name === '../fulfillment/returnModel') return { exists: async () => activeReturn };
  if (name === '../fulfillment/shipmentModel') return { findOne: () => ({ sort: async () => null }) };
  if (name === '../fulfillment/groupModel') return {
    findOne: () => ({ sort: async () => null }),
    create: async (value) => (createdGroup = { _id: 'group', ...value }),
  };
  if (name === '../edi/x12') return { normalizeShipmentStatus: value => value || '' };
  if (name === '../edi') return { sample945: value => { assert.equal(value.status, 'labeled'); return 'edi'; } };
  if (name === '../fulfillment') return { shipGroup: async value => { shipCall = value; return { shipment: { id: 'shipment', status: 'labeled' } }; } };
  return {};
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/orders/service.js'), 'utf8'), context);
(async () => {
  const ship = () => context.module.exports.apply945({ order, shop: { companyId: 'company' }, trackingNumber: '1Z999AA10123456784', carrier: 'UPS' });
  const result = await ship();
  assert.equal(createdGroup.warehouseId, 'warehouse');
  assert.equal(createdGroup.lines[0].allocatedQty, 1);
  assert.equal(shipCall.groupId, 'group');
  assert.equal(result.shipment.status, 'labeled');
  activeReturn = true;
  await assert.rejects(ship(), /active return/);
  activeReturn = false;
  order.status = 'returned';
  await assert.rejects(ship(), /already shipped or has a return/);
  order.status = 'error';
  await assert.rejects(ship(), /Resolve the order error/);
  order.status = '940_ready'; order.warehouseId = null;
  await assert.rejects(ship(), /Assign a warehouse/);
  console.log('Manual shipping: carrier formats, legacy shipment path, initial status, and return locks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
