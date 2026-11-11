const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../src');
let checks = 0;
function load(file, stubs = {}, globals = {}) {
  const filename = path.resolve(root, file);
  const localRequire = createRequire(filename);
  const context = { exports: {}, Error, window: { confirm: () => false }, ...globals };
  context.require = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), name);
      for (const extension of ['.tsx', '.ts']) if (fs.existsSync(target + extension)) return load(path.relative(root, target + extension), stubs);
    }
    return localRequire(name);
  };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, context, { filename });
  return context.exports;
}
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const icons = new Proxy({}, { get: () => () => React.createElement('svg') });
const api = { SHIPMENT_STATUS_OPTIONS: [] };
const banner = { default: ({ children, stats }) => React.createElement('div', null, stats, children), __esModule: true };
const base = { id: 'order', orderNumber: '1046', shopId: 'shop', source: 'demo', status: '940_ready', warehouseId: 'warehouse', createdAt: '2026-10-16T00:53:00Z', lineItems: [{ id: 'line', sku: 'IT-01', quantity: 1 }] };
const cockpit = load('components/company/OrderCockpit.tsx', { 'lucide-react': icons, '../../lib/api': api, '../ui/PageBanner': banner }).default;
const renderCockpit = (overrides = {}) => renderToStaticMarkup(React.createElement(cockpit, {
  order: base, groups: [], shipments: [], returns: [], logs: [], warehouses: [], operations: null,
  fulfillmentWorkbench: null, needsShopifySync: false, syncing: false, onBack() {}, onRefresh() {}, onSync() {}, ...overrides,
}));
check('TC-040: detail sections render', () => {
  const html = renderCockpit();
  for (const text of ['THE JOURNEY', 'Financials', 'LIVE LOG', 'SHIPMENTS', 'Placed']) assert.ok(html.includes(text), text);
});
check('TC-042/046: error order retains Error label', () => {
  const html = renderCockpit({ order: { ...base, status: 'error', warehouseId: null, lastError: 'Missing SKU' } });
  assert.match(html, /oc-hero-pill[^>]*>Error</);
  assert.ok(html.includes('Missing SKU'));
});
check('TC-050: fulfilled is not proof of delivery', () => {
  const html = renderCockpit({ order: { ...base, status: 'fulfilled' },
    groups: [{ id: 'group', status: 'shipped', warehouseId: 'warehouse', lines: [] }],
    shipments: [{ id: 'shipment', fulfillmentGroupId: 'group', status: 'labeled', carrier: 'UPS', trackingNumber: '1Z999AA10123456784', statusHistory: [] }],
  });
  assert.match(html, /oc-hero-pill[^>]*>Fulfilled</);
  assert.match(html, /<strong>Shipped<\/strong>/);
  assert.ok(html.includes('1 SHIPMENTS'));
  assert.doesNotMatch(html, /oc-intro-status[^]*?<strong>Delivered<\/strong>/);
});
check('TC-044: Shopify discount counted once; invalid recorded totals flagged', () => {
  const reconciled = renderCockpit({ order: { ...base, source: 'shopify', currency: 'USD', totals: { subtotal: '80', totalDiscounts: '20', totalShipping: '8', totalTax: '2', totalPrice: '90' } } });
  assert.ok(reconciled.includes('$100.00'));
  assert.ok(!reconciled.includes('do not reconcile'));
  const invalid = renderCockpit({ order: { ...base, source: 'shopify', totals: { subtotal: '0', totalDiscounts: '72', totalShipping: '8', totalTax: '0', totalPrice: '0' } } });
  assert.ok(invalid.includes('Recorded amounts do not reconcile'));
});
check('TC-076: placed date and log timestamps include year', () => {
  const html = renderCockpit({ logs: [{ id: 'log', type: 'order_flow', createdAt: '2026-10-16T00:53:00Z', message: 'Held until 2026-10-15T20:08:33.559Z', meta: {} }] });
  assert.match(html, /Placed [^<]*2026/);
  assert.ok(!html.includes('Held until 2026-10-15T20:08:33.559Z'));
});
const ship = load('components/OrderShipActions.tsx', { '../lib/api': { resolveFileLinkUrl: () => null }, './use945Upload': { use945Upload: () => ({ uploading: false, overlay: null }) } }).default;
const renderShip = (order, disabled = false) => renderToStaticMarkup(React.createElement(ship, { order, disabled, onDone() {}, onError() {} }));
check('TC-046/053: Ship locked for invalid order states and active return', () => {
  for (const status of ['error', 'fulfilled', 'returned', 'partially_returned', 'cancelled']) assert.match(renderShip({ ...base, status }), /type="submit" disabled/);
  assert.match(renderShip({ ...base, warehouseId: null }), /type="submit" disabled/);
  assert.match(renderShip(base, true), /type="submit" disabled/);
  assert.doesNotMatch(renderShip(base), /type="submit" disabled/);
});
check('TC-047/051/063: required tracking, blank carrier and restricted upload types', () => {
  const html = renderShip({ ...base, carrier: 'UPS' });
  assert.match(html, /aria-label="Tracking number" required/);
  assert.match(html, /aria-label="Carrier"[^>]*value=""/);
  assert.ok(html.includes('accept=".edi,.txt,.json"'));
  assert.ok(!html.includes('.json,*'));
});
const progress = load('components/company/OrderListShipCells.tsx');
check('TC-050/068: dots are indicators and fulfillment is not delivery', () => {
  const html = renderToStaticMarkup(React.createElement(progress.OrderShipProgressCell, { order: { ...base, status: 'fulfilled', shipmentStatus: 'labeled' } }));
  assert.ok(!html.includes('<button'));
  assert.equal(progress.getShipProgress({ ...base, status: 'fulfilled', shipmentStatus: 'labeled' }).phase, 'dispatched');
  assert.equal(progress.getShipProgress({ ...base, shipmentStatus: 'delivered' }).phase, 'delivered');
});
const route = load('routes/account/orders.index.tsx', {
  '@tanstack/react-router': { createFileRoute: () => value => value },
  '../../components/company/OrdersPanel': {},
}).Route;
check('TC-014/025/028/038: URL values validated and retained', () => {
  const search = route.validateSearch({ page: '2', q: '1047', shop: 'shop', warehouse: 'warehouse', status: 'allocated' });
  assert.equal(search.page, 2); assert.equal(search.q, '1047'); assert.equal(search.shop, 'shop');
  assert.equal(route.validateSearch({ status: 'foobar' }).status, undefined);
  for (const page of [-1, 'abc', 'Infinity', 1.5, {}, true]) assert.equal(route.validateSearch({ page }).page, undefined);
});
check('TC-025/028/030/031/032/038: rapid filter updates preserve latest URL state', () => {
  let search = { page: 2, q: '1047', status: 'error' };
  let toolbar;
  let pagination;
  let table;
  const list = load('components/company/OrdersPanel.tsx', {
    'lucide-react': icons,
    '@tanstack/react-router': {
      useSearch: () => search,
      useNavigate: () => options => { search = typeof options.search === 'function' ? options.search(search) : options.search; },
    },
    './CompanyPortalContext': { useCompanyPortal: () => ({ company: { warehouses: [{ id: 'main', name: 'Main' }], shops: [] }, currentUser: { role: 'root' }, shopsById: new Map(), setError() {} }) },
    '../../lib/api': {},
    '../ui/PageBanner': { ...banner, BannerSnapshot: () => null },
    '../ui': {
      DataTable: props => { table = props; return null }, StatusBadge: () => null, StatusTabs: () => null,
      ListToolbar: props => { toolbar = props; return null },
      Pagination: props => { pagination = props; return null },
    },
  }).default;
  renderToStaticMarkup(React.createElement(list));
  assert.equal(pagination.page, 2);
  assert.equal(table.emptyTitle, 'No matching orders');
  toolbar.filters.find(filter => filter.key === 'shop').onChange('store');
  toolbar.filters.find(filter => filter.key === 'warehouse').onChange('main');
  assert.equal(search.shop, 'store'); assert.equal(search.warehouse, 'main');
  assert.equal(search.status, 'error'); assert.equal(search.q, '1047'); assert.equal(search.page, undefined);
  pagination.onPageChange(2);
  assert.equal(search.page, 2); assert.equal(search.shop, 'store');
  toolbar.onClear();
  for (const key of ['page', 'shop', 'warehouse', 'q', 'status']) assert.equal(search[key], undefined);
  renderToStaticMarkup(React.createElement(list));
  assert.equal(table.emptyTitle, 'No orders yet');
});
check('TC-036/037: pagination labels and disabled boundary buttons', () => {
  const Pagination = load('components/ui/Pagination.tsx').default;
  const render = (page, limit) => renderToStaticMarkup(React.createElement(Pagination, { page, limit, total: 49, onPageChange() {}, onLimitChange() {} }));
  const first = render(1, 25);
  assert.ok(first.includes('Showing 1–25 of 49'));
  assert.match(first, /<button[^>]*disabled=""[^>]*>Previous<\/button>/);
  const second = render(2, 25);
  assert.ok(second.includes('Showing 26–49 of 49'));
  assert.match(second, /<button[^>]*disabled=""[^>]*>Next<\/button>/);
  assert.equal((render(1, 50).match(/disabled=""/g) || []).length, 2);
});
(async () => {
  let calls = 0;
  const effects = [];
  const payload = { order: base, groups: [], shipments: [], returns: [], logs: [] };
  const panel = load('components/company/OrderFulfillmentPanel.tsx', {
    react: { ...React, useEffect: fn => effects.push(fn) },
    '../../lib/api': { getOrderFulfillment: async () => { calls++; return payload } },
    '../use945Upload': { use945Upload: () => ({ uploading: false, overlay: null }) },
    '../BrandLoader': { default: () => null, __esModule: true },
    '../ui': {},
    './ShipmentTracker': {},
  }).default;
  renderToStaticMarkup(React.createElement(panel, { orderId: 'order', data: payload, warehouses: [], onDone() {}, onError() {} }));
  for (const effect of effects.splice(0)) effect();
  await Promise.resolve();
  assert.equal(calls, 0);
  renderToStaticMarkup(React.createElement(panel, { orderId: 'order', warehouses: [], onDone() {}, onError() {} }));
  for (const effect of effects.splice(0)) effect();
  await Promise.resolve();
  assert.equal(calls, 1);
  console.log('PASS TC-045: embedded fulfillment reuses parent data; standalone fetches once'); checks++;
  let submitted = 0;
  let message = '';
  let confirm = false;
  let response = {};
  const controls = [];
  const runtime = require('react/jsx-runtime');
  const capture = (method) => (type, props, key) => {
    if (type === 'form' || type === 'button') controls.push({ type, ...props });
    return runtime[method](type, props, key);
  };
  const actions = load('components/OrderShipActions.tsx', {
    'react/jsx-runtime': { ...runtime, jsx: capture('jsx'), jsxs: capture('jsxs') },
    '../lib/api': { resolveFileLinkUrl: () => null, shipOrder: async () => { submitted++; if (response instanceof Error) throw response; return response; } },
    './use945Upload': { use945Upload: () => ({ uploading: false, overlay: null }) },
  }, { window: { confirm: () => confirm } }).default;
  renderToStaticMarkup(React.createElement(actions, { order: base, onDone() {}, onError(value) { message = value }, onSuccess(value) { message = value } }));
  const form = controls.find(control => control.type === 'form');
  await form.onSubmit({ preventDefault() {} });
  assert.equal(submitted, 0);
  console.log('PASS TC-067: cancelling Ship confirmation sends no request'); checks++;
  confirm = true;
  await form.onSubmit({ preventDefault() {} });
  assert.equal(message, 'Shipment recorded');
  response = { shopifyError: 'Unavailable' };
  await form.onSubmit({ preventDefault() {} });
  assert.match(message, /Shopify sync failed: Unavailable/);
  response = new Error('Shipment failed');
  await form.onSubmit({ preventDefault() {} });
  assert.equal(message, 'Shipment failed');
  console.log('PASS TC-077: shipping success, partial sync failure and request failure feedback'); checks++;
  console.log(`Orders UI: ${checks} groups passed (server rendering, handler checks and route validation; no browser interaction)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
