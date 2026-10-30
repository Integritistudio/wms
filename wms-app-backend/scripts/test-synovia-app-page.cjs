const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { renderAppPage } = require('../src/modules/shopify/appPage');

const source = fs.readFileSync(require.resolve('../src/modules/shopify/service'), 'utf8');
const sandbox = {
  module: { exports: {} },
  require(id) {
    if (id === './appPage') return { renderAppPage };
    if (id === '../../config/env') return { shopifyApiKey: 'test-key' };
    if (id === '../shops') return { normalizeShopDomain: (value) => value || '' };
    return {};
  },
};
vm.runInNewContext(source, sandbox);

async function loadPage(shop) {
  const reply = { type() { return this; }, header() { return this; }, send(html) { return html; } };
  return sandbox.module.exports.handleAppLoad({ query: { shop } }, reply);
}

async function connection(html, result, withBridge = true) {
  const elements = Object.fromEntries(['status', 'status-title', 'connection-state', 'retry-connection'].map((id) => [id, {
    textContent: '', dataset: {}, hidden: true, disabled: false, setAttribute() {}, addEventListener(type, fn) { this[type] = fn; },
  }]));
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const calls = [];
  vm.runInNewContext(code, {
    document: { getElementById: (id) => elements[id] },
    window: withBridge ? { shopify: { idToken: async () => 'session-token' } } : {},
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { calls.push({ url, options }); if (result instanceof Error) throw result; return { ok: true, json: async () => result }; },
  });
  await new Promise(setImmediate);
  return { elements, calls };
}

(async () => {
  const html = await loadPage('demo.myshopify.com');
  assert.match(html, /Synovia/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /demo\.myshopify\.com/);
  const success = await connection(html, { success: true, data: { attached: true } });
  assert.equal(success.elements['connection-state'].dataset.state, 'success');
  assert.equal(success.elements['retry-connection'].hidden, true);
  assert.equal(success.calls[0].options.headers.Authorization, 'Bearer session-token');
  assert.equal(JSON.parse(success.calls[0].options.body).shop, 'demo.myshopify.com');
  const unlinked = await connection(html, { success: true, data: { attached: false } });
  assert.equal(unlinked.elements['connection-state'].dataset.state, 'warning');
  assert.equal(unlinked.elements['retry-connection'].hidden, false);
  const failed = await connection(html, new Error('Network unavailable'));
  assert.equal(failed.elements['connection-state'].dataset.state, 'error');
  assert.equal(failed.elements.status.textContent, 'Network unavailable');
  assert.equal(failed.elements['retry-connection'].disabled, false);
  const outsideAdmin = await connection(html, null, false);
  assert.equal(outsideAdmin.elements['connection-state'].dataset.state, 'warning');
  assert.equal(outsideAdmin.calls.length, 0);
  const noShop = await loadPage('');
  assert.match(noShop, /Open Synovia in Shopify Admin/);
  assert.doesNotMatch(noShop, /Connected to Synovia/);
  const escaped = renderAppPage({ shop: '<script>alert(1)</script>', title: '<unsafe>', message: '"hello" & goodbye' });
  assert.match(escaped, /&lt;script&gt;/);
  assert.doesNotMatch(escaped, /<script>alert/);
  console.log('Synovia app page: connection, setup, failure, standalone, and escaping checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
