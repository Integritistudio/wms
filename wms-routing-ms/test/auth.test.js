const { test } = require("node:test");
const assert = require("node:assert/strict");
const { authenticate } = require("../src/auth");
const { secret, tenantA, tenantB, signed } = require("./helpers");

const request = (options) => ({ method: options.method, raw: { url: options.url }, headers: options.headers, rawBody: options.payload || "" });
test("signature binds tenant, method, path, timestamp and exact body", () => {
  const options = signed("PUT", "/v1/routing/config", tenantA, { data: { enabled: true } });
  assert.equal(authenticate(request(options), secret), tenantA);
  for (const changed of [
    { ...options, method: "POST" }, { ...options, url: "/v1/routing/rules" },
    { ...options, payload: '{"data":{"enabled":false}}' },
    { ...options, headers: { ...options.headers, "x-routing-tenant": tenantB } },
    { ...options, headers: { ...options.headers, "x-routing-timestamp": "1" } },
    { ...options, headers: { ...options.headers, "x-routing-signature": "invalid" } },
  ]) assert.throws(() => authenticate(request(changed), secret), { statusCode: 401 });
  assert.throws(() => authenticate(request(signed("GET", "/v1/routing/config", tenantA, undefined, { timestamp: String(Date.now() - 61000) })), secret), { statusCode: 401 });
  assert.throws(() => authenticate({ method: "GET", raw: { url: "/" }, headers: {} }, secret), { statusCode: 401 });
});
