/**
 * Rigorous routing-settings smoke suite.
 *
 * Covers happy + failure paths for routing toggles.
 * Requires API up: npm run dev in wms-app-backend
 *
 *   node scripts/routing-settings-smoke.js
 */
const path = require("path");
const bcrypt = require("bcrypt");

const BASE = process.env.API_URL || "http://localhost:3000";
const results = [];

function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, pass: false, detail: String(detail || "") });
  console.error(`  FAIL  ${name} — ${detail}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(method, pathName, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${pathName}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 400 || json.success === false) {
    throw new Error(`${method} ${pathName} → ${res.status}: ${JSON.stringify(json).slice(0, 700)}`);
  }
  return json;
}

async function runCase(name, fn) {
  console.log(`\n— ${name} —`);
  try {
    await fn();
  } catch (err) {
    fail(name, err.message || err);
  }
}

async function bootstrapPassword(companyId, email, password) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const { connectDb, disconnectDb } = require("../src/db/connect");
  const Company = require("../src/modules/companies/model");
  const members = require("../src/modules/companies/members");
  await connectDb();
  try {
    const company = await Company.findById(companyId);
    assert(company, "company missing");
    const member = await members.ensureRootMember(company);
    const hashed = await bcrypt.hash(password, 10);
    member.password = hashed;
    member.status = "active";
    member.email = email;
    member.inviteTokenHash = null;
    member.inviteExpiresAt = null;
    await member.save();
    company.password = hashed;
    company.status = "active";
    company.email = email;
    company.inviteTokenHash = null;
    await company.save();
  } finally {
    await disconnectDb();
  }
}

async function saveRouting(token, patch) {
  const res = await req("PUT", "/company/routing/config", { token, body: patch });
  return res.data;
}

async function getOrder(token, orderId) {
  const res = await req("GET", `/company/orders/${orderId}/fulfillment`, { token });
  return res.data.order;
}

async function getFulfillment(token, orderId) {
  const res = await req("GET", `/company/orders/${orderId}/fulfillment`, { token });
  return res.data;
}

async function assignWarehouse(token, orderId, warehouseId) {
  const res = await req("PATCH", `/company/orders/${orderId}/warehouse`, {
    token,
    body: { warehouseId },
  });
  return res.data;
}

async function simulate(platformToken, shopId, body) {
  const res = await req("POST", `/platform/shops/${shopId}/simulate-order`, {
    token: platformToken,
    body: { respectRouting: true, ...body },
  });
  return res.data;
}

async function seedInventory(token, warehouseId, skus, qty = 50) {
  await req("PUT", `/company/warehouses/${warehouseId}/inventory`, {
    token,
    body: { items: skus.map((sku) => ({ sku, quantityOnHand: qty })) },
  });
}

async function listFailed(token) {
  const res = await req("GET", "/company/failed-orders?resolved=false&limit=100", { token });
  return res.data?.items || [];
}

async function listNotifications(token) {
  const res = await req("GET", "/company/notifications?limit=100", { token });
  return res.data?.items || [];
}

async function clearRules(token) {
  const list = await req("GET", "/company/routing/rules", { token });
  for (const rule of list.data || []) {
    await req("DELETE", `/company/routing/rules/${rule._id}`, { token });
  }
}

async function setup() {
  await req("GET", "/health");
  const db = await req("GET", "/health/db");
  if (db.data && db.data.connected === false) {
    throw new Error("MongoDB not connected — start backend with a working Atlas connection");
  }
  ok("health + db");

  const login = await req("POST", "/platform/auth/login", {
    body: { username: "platform", password: "change-me-now" },
  });
  const platformToken = login.data.token;
  ok("platform login");

  const stamp = Date.now();
  const email = `routing-smoke-${stamp}@example.com`;
  const password = "RoutingSmoke123!";

  const created = await req("POST", "/platform/companies", {
    token: platformToken,
    body: { name: `Routing Smoke ${stamp}`, email, notes: "routing-settings-smoke" },
  });
  const companyId = created.data?.company?.id || created.data?.id;
  assert(companyId, "company id missing");

  await bootstrapPassword(companyId, email, password);

  const companyLogin = await req("POST", "/company/auth/login", { body: { email, password } });
  const companyToken = companyLogin.data.token;
  ok("company login", email);

  const shopRes = await req("POST", `/platform/companies/${companyId}/shops`, {
    token: platformToken,
    body: { shopDomain: `routing-smoke-${stamp}.myshopify.com` },
  });
  const shopId = shopRes.data?.id || shopRes.data?.shop?.id;
  assert(shopId, "shop id missing");
  ok("shop created", shopId);

  const whA = await req("POST", "/company/warehouses", {
    token: companyToken,
    body: {
      name: "Austin Primary",
      code: "AUS",
      street: "100 Congress Ave",
      city: "Austin",
      state: "TX",
      country: "US",
      zip: "78701",
      zipPrefixes: "787",
      routingPriority: 10,
    },
  });
  const whB = await req("POST", "/company/warehouses", {
    token: companyToken,
    body: {
      name: "Dallas Fallback",
      code: "DAL",
      street: "1 Main St",
      city: "Dallas",
      state: "TX",
      country: "US",
      zip: "75201",
      zipPrefixes: "752",
      routingPriority: 50,
    },
  });
  const whAId = whA.data?.id;
  const whBId = whB.data?.id;
  assert(whAId && whBId, `warehouses missing: ${JSON.stringify({ whA: whA.data, whB: whB.data }).slice(0, 400)}`);
  ok("warehouses created", `${whAId.slice(-6)} / ${whBId.slice(-6)}`);

  const skus = ["RT-SMOKE-1", "RT-SMOKE-2", "RT-RULE-SKU"];
  await seedInventory(companyToken, whAId, skus);
  await seedInventory(companyToken, whBId, skus);
  ok("inventory seeded");

  await clearRules(companyToken);

  return { platformToken, companyToken, companyId, shopId, email, password, whAId, whBId, stamp };
}

async function main() {
  console.log(`\n=== Routing settings smoke @ ${BASE} ===\n`);
  const ctx = await setup();

  await runCase("Config round-trip", async () => {
    const saved = await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: false,
      defaultWarehouseId: ctx.whAId,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
      partialPolicy: "ship_available",
    });
    assert(saved.enabled === true, "enabled");
    assert(saved.autoAssignOnReceive === false, "autoAssign");
    assert(saved.autoDeliverSftp === false, "autoDeliverSftp");
    assert(String(saved.defaultWarehouseId) === String(ctx.whAId), "default");
    assert(String(saved.fallbackWarehouseId) === String(ctx.whBId), "fallback");
    ok("config persists all toggles");
  });

  await runCase("Routing OFF → blank until manual assign", async () => {
    await saveRouting(ctx.companyToken, {
      enabled: false,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: ctx.whAId,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `OFF-${String(ctx.stamp).slice(-6)}`,
      zip: "78701",
      lineItems: [{ sku: "RT-SMOKE-1", title: "Smoke", quantity: 1 }],
    });
    assert(!order.warehouseId, `blank expected, got ${order.warehouseId}`);
    assert(!order.suggestedWarehouseId, `no suggestion expected, got ${order.suggestedWarehouseId}`);
    assert(order.status === "received", `received expected, got ${order.status}`);
    ok("routing off leaves blank", order.orderNumber);

    const assigned = await assignWarehouse(ctx.companyToken, order.id, ctx.whAId);
    assert(String(assigned.warehouseId) === String(ctx.whAId), `assign failed: ${assigned.warehouseId}`);
    assert(assigned.status === "940_ready", `940_ready expected, got ${assigned.status}`);
    ok("manual assign after routing off", assigned.status);
  });

  await runCase("Routing ON + auto-assign ON → commit", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: ctx.whAId,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `AUTO-${String(ctx.stamp).slice(-6)}`,
      zip: "78701",
      lineItems: [{ sku: "RT-SMOKE-1", title: "Smoke", quantity: 1 }],
    });
    assert(String(order.warehouseId) === String(ctx.whAId), `WH ${order.warehouseId}`);
    assert(!order.suggestedWarehouseId, "suggestion should be cleared");
    assert(order.status === "940_ready", `status ${order.status}`);
    ok("auto-assign commits default", order.routingReason || "default");

    const ful = await getFulfillment(ctx.companyToken, order.id);
    assert((ful.groups || []).length >= 1, "need fulfillment group");
    ok("940 groups after auto-assign", `${ful.groups.length} group(s)`);
  });

  await runCase("Routing ON + auto-assign OFF → suggest → Accept", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: false,
      defaultWarehouseId: ctx.whAId,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `SUG-${String(ctx.stamp).slice(-6)}`,
      zip: "78701",
      lineItems: [{ sku: "RT-SMOKE-2", title: "Smoke 2", quantity: 1 }],
    });
    assert(!order.warehouseId, `unassigned expected, got ${order.warehouseId}`);
    assert(String(order.suggestedWarehouseId) === String(ctx.whAId), `suggest ${order.suggestedWarehouseId}`);
    assert(order.status === "received", `status ${order.status}`);
    assert(order.sftpStatus === "skipped" || !order.sftpStatus, `sftp ${order.sftpStatus}`);
    ok("suggestion-only (no SFTP)", order.routingReason || "");

    const notifs = await listNotifications(ctx.companyToken);
    assert(
      notifs.some((n) => String(n.meta?.orderId || "") === String(order.id)),
      "notification for suggested order"
    );
    ok("notification for suggest/receive");

    const accepted = await assignWarehouse(ctx.companyToken, order.id, order.suggestedWarehouseId);
    assert(String(accepted.warehouseId) === String(ctx.whAId), `accept WH ${accepted.warehouseId}`);
    assert(!accepted.suggestedWarehouseId, "suggestion cleared");
    assert(accepted.status === "940_ready", `status ${accepted.status}`);
    ok("Accept commits warehouse + 940");
  });

  await runCase("Rule match picks target warehouse", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: ctx.whAId,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
    });
    await req("POST", "/company/routing/rules", {
      token: ctx.companyToken,
      body: {
        name: "SKU → Dallas",
        enabled: true,
        priority: 1,
        warehouseId: ctx.whBId,
        conditionLogic: "and",
        requireAllItemsInStock: false,
        conditions: [{ field: "sku_equals", operator: "equals", value: "RT-RULE-SKU" }],
      },
    });
    ok("rule created");

    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `RULE-${String(ctx.stamp).slice(-6)}`,
      zip: "78701",
      lineItems: [{ sku: "RT-RULE-SKU", title: "Rule SKU", quantity: 1 }],
    });
    assert(String(order.warehouseId) === String(ctx.whBId), `expected Dallas, got ${order.warehouseId}`);
    assert(/rule/i.test(order.routingReason || ""), `reason ${order.routingReason}`);
    ok("rule → Dallas", order.routingReason);
  });

  await runCase("No default → fallback warehouse", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: null,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `FB-${String(ctx.stamp).slice(-6)}`,
      zip: "99999",
      lineItems: [{ sku: "RT-SMOKE-1", title: "Smoke", quantity: 1 }],
    });
    assert(String(order.warehouseId) === String(ctx.whBId), `fallback ${order.warehouseId}`);
    assert(/fallback/i.test(order.routingReason || ""), `reason ${order.routingReason}`);
    ok("fallback used", order.routingReason);
  });

  await runCase("No match + no fallback → error + DLQ", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: null,
      fallbackWarehouseId: null,
      addressMode: "off",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `NOM-${String(ctx.stamp).slice(-6)}`,
      zip: "00000",
      lineItems: [{ sku: "RT-SMOKE-1", title: "Smoke", quantity: 1 }],
    });
    assert(order.status === "error", `status ${order.status}`);
    assert(!order.warehouseId, "warehouse null");
    assert(!order.suggestedWarehouseId, "suggestion null");
    ok("error status", order.lastError || order.routingReason);

    const failed = await listFailed(ctx.companyToken);
    const entry = failed.find((f) => String(f.orderId) === String(order.id));
    assert(entry, "DLQ missing");
    assert(entry.reason === "ROUTING_NO_MATCH", `reason ${entry.reason}`);
    ok("DLQ ROUTING_NO_MATCH");

    const notifs = await listNotifications(ctx.companyToken);
    assert(
      notifs.some(
        (n) =>
          String(n.meta?.orderId || "") === String(order.id) &&
          (n.type === "order_error" || /warehouse|failed|needs/i.test(`${n.title} ${n.message}`))
      ),
      "error notification missing"
    );
    ok("error notification");
  });

  await runCase("ZIP prefix mode suggestion (auto-assign off)", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: false,
      defaultWarehouseId: null,
      fallbackWarehouseId: ctx.whAId,
      addressMode: "zip_prefix",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `ZIP-${String(ctx.stamp).slice(-6)}`,
      zip: "75201",
      city: "Dallas",
      provinceCode: "TX",
      lineItems: [{ sku: "RT-SMOKE-1", title: "Smoke", quantity: 1 }],
    });
    assert(!order.warehouseId, "should not commit");
    assert(String(order.suggestedWarehouseId) === String(ctx.whBId), `suggest ${order.suggestedWarehouseId}`);
    ok("ZIP → Dallas suggestion", order.routingReason);
  });

  await runCase("Unknown SKU → PRODUCT_NOT_FOUND", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: ctx.whAId,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `PNF-${String(ctx.stamp).slice(-6)}`,
      zip: "78701",
      lineItems: [{ sku: "DOES-NOT-EXIST-SKU", title: "Ghost", quantity: 1 }],
    });
    assert(order.status === "error", `status ${order.status}`);
    const failed = await listFailed(ctx.companyToken);
    const entry = failed.find((f) => String(f.orderId) === String(order.id));
    assert(entry, "DLQ missing");
    assert(entry.reason === "PRODUCT_NOT_FOUND", `reason ${entry.reason}`);
    ok("PRODUCT_NOT_FOUND");
  });

  await runCase("Suggest then pick different warehouse", async () => {
    await clearRules(ctx.companyToken);
    await saveRouting(ctx.companyToken, {
      enabled: true,
      autoAssignOnReceive: false,
      autoDeliverSftp: false,
      defaultWarehouseId: ctx.whAId,
      fallbackWarehouseId: ctx.whBId,
      addressMode: "off",
    });
    const order = await simulate(ctx.platformToken, ctx.shopId, {
      orderNumber: `PICK-${String(ctx.stamp).slice(-6)}`,
      zip: "78701",
      lineItems: [{ sku: "RT-SMOKE-1", title: "Smoke", quantity: 1 }],
    });
    assert(String(order.suggestedWarehouseId) === String(ctx.whAId), "suggest A");
    const picked = await assignWarehouse(ctx.companyToken, order.id, ctx.whBId);
    assert(String(picked.warehouseId) === String(ctx.whBId), `picked B got ${picked.warehouseId}`);
    assert(!picked.suggestedWarehouseId, "cleared suggestion");
    ok("user overrode suggestion with B");
  });

  await saveRouting(ctx.companyToken, {
    enabled: true,
    autoAssignOnReceive: true,
    autoDeliverSftp: false,
    defaultWarehouseId: ctx.whAId,
    fallbackWarehouseId: ctx.whBId,
    addressMode: "off",
  }).catch(() => {});

  const passed = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;
  console.log(`\n=== Summary: ${passed} passed, ${failedCount} failed ===`);
  console.log(`Company: ${ctx.email} / ${ctx.password}`);
  console.log(`A=${ctx.whAId}`);
  console.log(`B=${ctx.whBId}\n`);
  if (failedCount) process.exit(1);
}

main().catch((err) => {
  console.error("\n=== FATAL ===\n", err);
  process.exit(1);
});
