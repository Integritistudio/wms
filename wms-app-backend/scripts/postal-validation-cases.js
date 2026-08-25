/**
 * Postal / ZIP validation cases (country + state).
 *
 * Unit tests always run. If the API is up, also posts a warehouse with a
 * New York ZIP against Texas — that request must fail with 400.
 *
 *   node scripts/postal-validation-cases.js
 */
const { assertPostalCode } = require("../src/utils/postalCode");

const BASE = process.env.API_URL || "http://localhost:3000";
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || "ahmadshaukat328@gmail.com";
const COMPANY_PASSWORD = process.env.COMPANY_PASSWORD || "TestSplit123!";

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail: String(detail || "") });
  console.error(`  FAIL  ${name} — ${detail}`);
}

function expectError(name, fn, match) {
  try {
    fn();
    fail(name, "expected an error, but validation passed");
  } catch (err) {
    const msg = err.message || String(err);
    if (match) {
      const okMatch = match instanceof RegExp ? match.test(msg) : msg.includes(String(match));
      if (!okMatch) {
        fail(name, `wrong error: ${msg}`);
        return;
      }
    }
    pass(name, msg);
  }
}

function expectOk(name, fn) {
  try {
    fn();
    pass(name);
  } catch (err) {
    fail(name, err.message);
  }
}

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

console.log("\nPostal validation cases\n");

expectOk("US TX 78701 is valid", () => assertPostalCode("US", "TX", "78701"));
expectOk("US TX ZIP+4 is valid", () => assertPostalCode("US", "TX", "78701-1234"));
expectError("US TX rejects NYC ZIP 10001", () => assertPostalCode("US", "TX", "10001"), /does not belong to TX/i);
expectError("US CA rejects Texas ZIP 78701", () => assertPostalCode("US", "CA", "78701"), /does not belong to CA/i);
expectError("US rejects letters", () => assertPostalCode("US", "TX", "ABCDE"), /Invalid postal code/i);
expectOk("CA ON M5V 2T6 is valid", () => assertPostalCode("CA", "ON", "M5V 2T6"));
expectError("CA ON rejects Vancouver code", () => assertPostalCode("CA", "ON", "V6B 1A1"), /does not belong to ON/i);
expectOk("AU NSW 2000 is valid", () => assertPostalCode("AU", "NSW", "2000"));
expectError("AU VIC rejects NSW 2000", () => assertPostalCode("AU", "VIC", "2000"), /does not belong to VIC/i);
expectError("missing ZIP", () => assertPostalCode("US", "TX", ""), /required/i);

async function liveApiCases() {
  console.log("\nLive API (warehouse create with bad ZIP)\n");
  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.log("  SKIP  API not reachable at", BASE);
    return;
  }

  const login = await api("POST", "/company/auth/login", {
    body: { email: COMPANY_EMAIL, password: COMPANY_PASSWORD },
  });
  const token = login.json?.data?.token;
  if (!token) {
    fail("company login", JSON.stringify(login.json).slice(0, 300));
    return;
  }
  pass("company login");

  const bad = await api("POST", "/company/warehouses", {
    token,
    body: {
      name: "ZIP mismatch test (must fail)",
      code: "ZIPERR",
      street: "1 Broadway",
      city: "New York",
      state: "TX",
      zip: "10001",
      country: "US",
    },
  });

  if (bad.status === 400 && /10001|TX|postal|ZIP/i.test(JSON.stringify(bad.json))) {
    pass("API rejects NY ZIP 10001 for Texas", bad.json.message || JSON.stringify(bad.json.data || bad.json));
  } else {
    fail("API rejects NY ZIP 10001 for Texas", `${bad.status} ${JSON.stringify(bad.json).slice(0, 400)}`);
  }
}

liveApiCases()
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed.length} failed\n`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
