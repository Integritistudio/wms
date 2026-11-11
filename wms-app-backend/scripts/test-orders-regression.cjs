const { spawnSync } = require('node:child_process');
const path = require('node:path');

const scripts = [
  'test-orders-list.cjs', 'test-order-search.cjs', 'test-order-sorting.cjs',
  'test-in-transit-filter.cjs', 'test-manual-shipping.cjs', 'test-orders-qa.cjs',
  'test-backorder-routing.cjs', '../../wms-admin-dash/scripts/test-orders-qa.cjs',
];
for (const script of scripts) {
  const filename = path.resolve(__dirname, script);
  console.log(`\nRunning ${path.basename(filename)}${script.startsWith('../') ? ' (frontend)' : ''}`);
  const result = spawnSync(process.execPath, [filename], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\nAll ${scripts.length} local orders regression suites passed. Live integrations were not exercised.`);
