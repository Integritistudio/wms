/**
 * Live API integration smoke tests against localhost:3000
 * Run: node scripts/smoke-test.js
 */
const path = require("path");
const bcrypt = require("bcrypt");

const BASE = process.env.API_URL || "http://localhost:3000";
const results = [];

function ok(name, detail) {
  results.push({ name, pass: true, detail: detail || "" });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, pass: false, detail: String(detail || "") });
  console.error(`  FAIL  ${name} — ${detail}`);
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
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function expectOk(name, method, pathName, opts = {}) {
  try {
    const { status, json } = await req(method, pathName, opts);
    if (status >= 200 && status < 300 && json.success !== false) {
      ok(name, `${status}`);
      return json;
    }
    fail(name, `HTTP ${status}: ${JSON.stringify(json).slice(0, 400)}`);
    return null;
  } catch (e) {
    fail(name, e.message);
    return null;
  }
}

function extractInviteToken(inviteUrl) {
  if (!inviteUrl) return null;
  const m = String(inviteUrl).match(/\/invite\/([^/?#]+)/);
  return m ? m[1] : null;
}

async function bootstrapCompanyPassword(companyId, email, password) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const { connectDb, disconnectDb } = require("../src/db/connect");
  const Company = require("../src/modules/companies/model");
  const members = require("../src/modules/companies/members");

  await connectDb();
  try {
    const company = await Company.findById(companyId);
    if (!company) throw new Error("company not found for bootstrap");
    const member = await members.ensureRootMember(company);
    const hashed = await bcrypt.hash(password, 10);
    member.password = hashed;
    member.status = "active";
    member.inviteTokenHash = null;
    member.inviteExpiresAt = null;
    await member.save();
    company.password = hashed;
    company.status = "active";
    company.inviteTokenHash = null;
    company.inviteExpiresAt = null;
    company.email = email;
    await company.save();
  } finally {
    await disconnectDb();
  }
  return true;
}

async function main() {
  console.log(`\n=== WMS Linker smoke tests @ ${BASE} ===\n`);

  console.log("— Health —");
  await expectOk("GET /health", "GET", "/health");
  await expectOk("GET /health/db", "GET", "/health/db");

  console.log("\n— Platform auth —");
  const platformLogin = await expectOk("POST /platform/auth/login", "POST", "/platform/auth/login", {
    body: { username: "platform", password: "change-me-now" },
  });
  const platformToken = platformLogin?.data?.token || platformLogin?.data?.accessToken;
  if (!platformToken) {
    fail("platform token", `missing token in ${JSON.stringify(platformLogin).slice(0, 200)}`);
    printSummary();
    process.exit(1);
  }
  ok("platform token present");

  await expectOk("GET /platform/auth/me", "GET", "/platform/auth/me", { token: platformToken });
  await expectOk("GET /platform/companies", "GET", "/platform/companies", { token: platformToken });
  await expectOk("GET /platform/shops", "GET", "/platform/shops", { token: platformToken });

  const stamp = Date.now();
  const smokeEmail = `smoke-${stamp}@example.com`;
  const smokePassword = "SmokeTest123!";

  console.log("\n— Provision smoke company —");
  const created = await expectOk("POST /platform/companies", "POST", "/platform/companies", {
    token: platformToken,
    body: {
      name: `Smoke Co ${stamp}`,
      email: smokeEmail,
      phone: "",
      notes: "automated smoke test",
    },
  });

  const companyId = created?.data?.company?.id || created?.data?.id;
  if (!companyId) {
    fail("company id", JSON.stringify(created).slice(0, 300));
    printSummary();
    process.exit(1);
  }
  ok("smoke company created", companyId);

  let inviteToken = extractInviteToken(created?.data?.inviteUrl);
  if (!inviteToken) {
    const invited = await expectOk("POST /platform/companies/:id/invite", "POST", `/platform/companies/${companyId}/invite`, {
      token: platformToken,
    });
    inviteToken = extractInviteToken(invited?.data?.inviteUrl);
  }

  if (inviteToken) {
    await expectOk("GET /company/auth/invite/:token", "GET", `/company/auth/invite/${inviteToken}`);
    const setPw = await expectOk("POST /company/auth/set-password", "POST", "/company/auth/set-password", {
      body: { token: inviteToken, password: smokePassword },
    });
    if (!setPw?.data?.token) {
      try {
        await bootstrapCompanyPassword(companyId, smokeEmail, smokePassword);
        ok("bootstrap company password via DB");
      } catch (e) {
        fail("set company password", e.message);
      }
    }
  } else {
    try {
      await bootstrapCompanyPassword(companyId, smokeEmail, smokePassword);
      ok("bootstrap company password via DB (no invite URL)");
    } catch (e) {
      fail("bootstrap company password", e.message);
      printSummary();
      process.exit(1);
    }
  }

  const shopRes = await expectOk("POST /platform/companies/:id/shops", "POST", `/platform/companies/${companyId}/shops`, {
    token: platformToken,
    body: { shopDomain: `smoke-${stamp}.myshopify.com` },
  });
  const shopId = shopRes?.data?.id || shopRes?.data?.shop?.id;

  const whRes = await expectOk("POST /platform/companies/:id/warehouses", "POST", `/platform/companies/${companyId}/warehouses`, {
    token: platformToken,
    body: { name: `Smoke WH ${stamp}`, code: "SMOKE", address: "1 Test Ave" },
  });
  const warehouseId = whRes?.data?.id || whRes?.data?.warehouse?.id;

  console.log("\n— Company auth —");
  const companyLogin = await expectOk("POST /company/auth/login", "POST", "/company/auth/login", {
    body: { email: smokeEmail, password: smokePassword },
  });
  const companyToken = companyLogin?.data?.token;
  if (!companyToken) {
    fail("company token", JSON.stringify(companyLogin).slice(0, 300));
    printSummary();
    process.exit(1);
  }
  ok("company token present");

  await expectOk("GET /company/me", "GET", "/company/me", { token: companyToken });
  await expectOk("GET /company/users", "GET", "/company/users", { token: companyToken });
  await expectOk("GET /company/orders", "GET", "/company/orders", { token: companyToken });
  const pagedOrders = await req("GET", "/company/orders?page=1&limit=10", { token: companyToken });
  if (pagedOrders.json?.data?.items && typeof pagedOrders.json.data.total === "number") {
    ok("company orders paginated shape");
  } else {
    fail("company orders paginated shape", JSON.stringify(pagedOrders.json).slice(0, 200));
  }
  await expectOk("GET /company/failed-orders", "GET", "/company/failed-orders", { token: companyToken });
  await expectOk("GET /company/failed-orders/count", "GET", "/company/failed-orders/count", { token: companyToken });
  await expectOk("GET /company/sftp-connections", "GET", "/company/sftp-connections", { token: companyToken });

  console.log("\n— Notifications / SMTP —");
  await expectOk("GET /company/notifications", "GET", "/company/notifications", { token: companyToken });
  await expectOk("GET /company/smtp-settings", "GET", "/company/smtp-settings", { token: companyToken });
  await expectOk("POST /company/notifications/read-all", "POST", "/company/notifications/read-all", {
    token: companyToken,
  });

  console.log("\n— Routing —");
  await expectOk("GET /company/routing/config", "GET", "/company/routing/config", { token: companyToken });
  await expectOk("PUT /company/routing/config", "PUT", "/company/routing/config", {
    token: companyToken,
    body: {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: warehouseId || null,
      partialPolicy: "ship_available",
    },
  });
  await expectOk("GET /company/routing/rules", "GET", "/company/routing/rules", { token: companyToken });

  let ruleId = null;
  if (warehouseId) {
    const rule = await expectOk("POST /company/routing/rules", "POST", "/company/routing/rules", {
      token: companyToken,
      body: {
        name: "Smoke default",
        priority: 10,
        enabled: true,
        warehouseId,
        conditionLogic: "and",
        conditions: [{ field: "totalQty", operator: "greater_or_equal", value: "1" }],
      },
    });
    ruleId = rule?.data?.id || rule?.data?._id;
    if (ruleId) ok("routing rule id", String(ruleId));

    await expectOk("POST /company/routing/test", "POST", "/company/routing/test", {
      token: companyToken,
      body: {
        lineItems: [{ sku: "SMOKE-SKU", quantity: 2 }],
        shippingAddress: { country: "US", province: "CA", city: "LA", zip: "90001" },
        shippingMethod: "standard",
      },
    });

    await expectOk("PUT /company/warehouses/:id/inventory", "PUT", `/company/warehouses/${warehouseId}/inventory`, {
      token: companyToken,
      body: { items: [{ sku: "SMOKE-SKU", quantityOnHand: 100, quantityAvailable: 100, reserved: 0 }] },
    });
    await expectOk("GET /company/warehouses/:id/inventory", "GET", `/company/warehouses/${warehouseId}/inventory`, {
      token: companyToken,
    });
  } else {
    fail("warehouse for routing", "missing warehouseId");
  }

  console.log("\n— Orders / fulfillment —");
  if (shopId) {
    const sim = await expectOk("POST /platform/shops/:id/simulate-order", "POST", `/platform/shops/${shopId}/simulate-order`, {
      token: platformToken,
      body: { sku: "SMOKE-SKU", quantity: 2, title: "Smoke item" },
    });
    const order = sim?.data?.order || sim?.data;
    const orderId = order?.id;

    if (orderId) {
      ok("demo order created", orderId);
      await expectOk("GET /platform/orders/:id", "GET", `/platform/orders/${orderId}`, { token: platformToken });
      await expectOk("GET /platform/shops/:id/orders", "GET", `/platform/shops/${shopId}/orders`, {
        token: platformToken,
      });
      await expectOk("GET /company/orders (after simulate)", "GET", "/company/orders", { token: companyToken });

      await expectOk("GET /company/orders/:id/fulfillment", "GET", `/company/orders/${orderId}/fulfillment`, {
        token: companyToken,
      });
      const alloc = await expectOk("POST /company/orders/:id/allocate", "POST", `/company/orders/${orderId}/allocate`, {
        token: companyToken,
        body: warehouseId ? { warehouseId } : {},
      });

      const groups = alloc?.data?.groups || [];
      if (groups.length) {
        ok("fulfillment groups", `${groups.length}`);
        const groupId = groups[0].id || groups[0]._id;
        await expectOk(
          "POST /company/fulfillment-groups/:id/ship",
          "POST",
          `/company/fulfillment-groups/${groupId}/ship`,
          {
            token: companyToken,
            body: { trackingNumber: "1ZSMOKE123", carrier: "UPS" },
          }
        );
      } else {
        // Fallback classic ship path
        await expectOk("GET /company/orders/:id/sample-945", "GET", `/company/orders/${orderId}/sample-945?trackingNumber=1ZSMOKE123`, {
          token: companyToken,
        });
        await expectOk("POST /company/orders/:id/ship", "POST", `/company/orders/${orderId}/ship`, {
          token: companyToken,
          body: { trackingNumber: "1ZSMOKE456", carrier: "UPS" },
        });
      }

      await expectOk("GET /company/orders/:id/logs", "GET", `/company/orders/${orderId}/logs`, {
        token: companyToken,
      });
      await expectOk("GET /company/orders/:id/fulfillment (after)", "GET", `/company/orders/${orderId}/fulfillment`, {
        token: companyToken,
      });
    } else {
      fail("demo order id", JSON.stringify(sim).slice(0, 300));
    }
  } else {
    fail("shop for simulate", "no shopId");
  }

  console.log("\n— Uploader —");
  if (shopId) {
    const upUser = `smoke-up-${stamp}`;
    const upPass = "UploaderTest123!";
    const up = await expectOk("POST /platform/shops/:id/uploaders", "POST", `/platform/shops/${shopId}/uploaders`, {
      token: platformToken,
      body: { username: upUser, password: upPass },
    });
    if (up) {
      const upLogin = await expectOk("POST /uploader/auth/login", "POST", "/uploader/auth/login", {
        body: { username: upUser, password: upPass },
      });
      const upToken = upLogin?.data?.token;
      if (upToken) {
        ok("uploader token present");
        await expectOk("GET /uploader/orders", "GET", "/uploader/orders", { token: upToken });
      } else {
        fail("uploader token", JSON.stringify(upLogin).slice(0, 300));
      }
    }
  }

  // Cleanup routing rule (best-effort)
  if (ruleId) {
    await expectOk("DELETE /company/routing/rules/:id", "DELETE", `/company/routing/rules/${ruleId}`, {
      token: companyToken,
    });
  }

  console.log("\n— Module integrity —");
  try {
    require("../src/modules/fulfillment");
    require("../src/modules/routing");
    require("../src/modules/queue");
    require("../src/modules/saga");
    require("../src/modules/edi/service");
    require("../src/modules/orders/service");
    require("../src/modules/notifications");
    ok("require fulfillment/routing/queue/saga/edi/orders/notifications");
  } catch (e) {
    fail("module require", e.message);
  }

  console.log("\n— Admin UI —");
  try {
    const ui = await fetch("http://localhost:5173/");
    if (ui.status === 200) ok("admin dash GET /", "200");
    else fail("admin dash GET /", `HTTP ${ui.status}`);
  } catch (e) {
    fail("admin dash reachable", e.message);
  }

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  • ${r.name}: ${r.detail}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
