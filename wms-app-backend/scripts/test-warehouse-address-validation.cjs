const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/modules/companies/service.js'), 'utf8');
const start = source.indexOf('async function assertWarehouseLocation(');
const end = source.indexOf('\nfunction normalizeZipPrefixes', start);
let lookups = 0;
let postalChecks = 0;
const context = {
  require(name) {
    if (name.endsWith('/country')) return { findOne: async () => { lookups++; return { isoCode: 'US' }; } };
    if (name.endsWith('/state')) return { find: () => ({ select: () => ({ lean: async () => [{ isoCode: 'NY' }] }) }) };
    if (name.endsWith('/postalCode')) return { assertPostalCode(country, state, zip) { postalChecks++; assert.equal(country, 'US'); assert.equal(state, 'NY'); assert.equal(zip, '10001'); } };
    throw new Error(`Unexpected dependency: ${name}`);
  },
  httpError: (status, message) => Object.assign(new Error(message), { status }),
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.validate = assertWarehouseLocation;', context);
(async () => {
  await context.validate({ requireCountry: false, address: 'Freeform address', zipPrefixes: ['100', '101'] });
  assert.equal(lookups, 0, 'Routing prefixes must not trigger physical address validation');
  await context.validate({ requireCountry: false, address: 'Freeform address', zipPrefixes: [] });
  await assert.rejects(context.validate({ requireCountry: false, street: '1 Main St' }), /Country is required/);
  await assert.rejects(context.validate({ requireCountry: false, zip: '10001' }), /Country is required/);
  await assert.rejects(context.validate({}), /Country is required/);
  await context.validate({ country: 'US', state: 'NY', zip: '10001' });
  assert.equal(postalChecks, 1, 'Structured addresses must retain postal validation');
  console.log('Warehouse address validation: 6 regression cases passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
