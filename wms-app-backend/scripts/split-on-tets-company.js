/**
 * Split-fulfillment on existing company (Tets / ahmadshaukat328@gmail.com)
 * Run: node scripts/split-on-tets-company.js
 */
const path = require("path");
const bcrypt = require("bcrypt");

const BASE = process.env.API_URL || "http://localhost:3000";
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || "ahmadshaukat328@gmail.com";
const COMPANY_PASSWORD = process.env.COMPANY_PASSWORD || "TestSplit123!";

async function req(method, pathName, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 400 || json.success === false) {
    throw new Error(`${method} ${pathName} → ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function ensureCompanyPassword(companyId, email, password) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const { connectDb, disconnectDb } = require("../src/db/connect");
  const Company = require("../src/modules/companies/model");
  const members = require("../src/modules/companies/members");
  await connectDb();
  try {
    const company = await Company.findById(companyId);
    if (!company) throw new Error("company not found");
    const member = await members.ensureRootMember(company);
    const hashed = await bcrypt.hash(password, 10);
    member.password = hashed;
    member.status = "active";
    member.email = email;
    await member.save();
    company.password = hashed;
    company.status = "active";
    company.email = email;
    await company.save();
  } finally {
    await disconnectDb();
  }
}

async function main() {
  const stamp = Date.now();
  console.log(`\n=== Split case on ${COMPANY_EMAIL} @ ${BASE} ===\n`);

  const login = await req("POST", "/platform/auth/login", {
    body: { username: "platform", password: "change-me-now" },
  });
  const platformToken = login.data.token;

  const companies = await req("GET", "/platform/companies", { token: platformToken });
  const company = (companies.data || []).find(
    (c) => String(c.email || "").toLowerCase() === COMPANY_EMAIL.toLowerCase()
  );
  assert(company, `company not found for ${COMPANY_EMAIL}`);
  const companyId = company.id;
  console.log("✓ company", company.name, companyId);

  const detail = await req("GET", `/platform/companies/${companyId}`, { token: platformToken });
  let shopId = detail.data.shops?.[0]?.id;
  let warehouses = detail.data.warehouses || [];

  if (!shopId) {
    const shopRes = await req("POST", `/platform/companies/${companyId}/shops`, {
      token: platformToken,
      body: { shopDomain: `tets-split-${stamp}.myshopify.com` },
    });
    shopId = shopRes.data.id || shopRes.data.shop?.id;
  }
  console.log("✓ shop", shopId);

  // Prefer existing W1 + Smoke WH, or create WH-A / WH-B
  let warehouseA = warehouses.find((w) => /w1|wh-a|a/i.test(w.code || w.name)) || warehouses[0];
  let warehouseB = warehouses.find((w) => w.id !== warehouseA?.id) || null;

  if (!warehouseA) {
    const whA = await req("POST", `/platform/companies/${companyId}/warehouses`, {
      token: platformToken,
      body: { name: "Warehouse A", code: "WH-A", address: "A Street" },
    });
    warehouseA = whA.data;
  }
  if (!warehouseB) {
    const whB = await req("POST", `/platform/companies/${companyId}/warehouses`, {
      token: platformToken,
      body: { name: "Warehouse B", code: "WH-B", address: "B Street" },
    });
    warehouseB = whB.data;
  }

  const warehouseAId = warehouseA.id;
  const warehouseBId = warehouseB.id;
  console.log("✓ warehouses", {
    A: `${warehouseA.name} (${warehouseAId})`,
    B: `${warehouseB.name} (${warehouseBId})`,
  });

  // Ensure we can login as company root for inventory / ship APIs
  let companyToken;
  try {
    const cl = await req("POST", "/company/auth/login", {
      body: { email: COMPANY_EMAIL, password: COMPANY_PASSWORD },
    });
    companyToken = cl.data.token;
    console.log("✓ company login (existing password)");
  } catch {
    console.log("… setting temporary password for test login");
    await ensureCompanyPassword(companyId, COMPANY_EMAIL, COMPANY_PASSWORD);
    const cl = await req("POST", "/company/auth/login", {
      body: { email: COMPANY_EMAIL, password: COMPANY_PASSWORD },
    });
    companyToken = cl.data.token;
    console.log("✓ company login (password reset for test)");
  }

  await req("PUT", "/company/routing/config", {
    token: companyToken,
    body: {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId: warehouseAId,
      partialPolicy: "ship_available",
    },
  });
  console.log("✓ routing: ship_available, default =", warehouseA.name);

  const skusA = ["TETS-SKU-1", "TETS-SKU-2", "TETS-SKU-3"];
  const skusB = ["TETS-SKU-4", "TETS-SKU-5"];

  // Seed exclusive stock so split is forced
  await req("PUT", `/company/warehouses/${warehouseAId}/inventory`, {
    token: companyToken,
    body: { items: skusA.map((sku) => ({ sku, quantityOnHand: 10 })) },
  });
  // Zero out B-only SKUs on A if they exist from prior runs
  await req("PUT", `/company/warehouses/${warehouseAId}/inventory`, {
    token: companyToken,
    body: { items: skusB.map((sku) => ({ sku, quantityOnHand: 0 })) },
  });
  await req("PUT", `/company/warehouses/${warehouseBId}/inventory`, {
    token: companyToken,
    body: { items: skusB.map((sku) => ({ sku, quantityOnHand: 10 })) },
  });
  await req("PUT", `/company/warehouses/${warehouseBId}/inventory`, {
    token: companyToken,
    body: { items: skusA.map((sku) => ({ sku, quantityOnHand: 0 })) },
  });
  console.log("✓ inventory — A has", skusA.join(", "), "| B has", skusB.join(", "));

  const lineItems = [...skusA, ...skusB].map((sku, i) => ({
    sku,
    title: `Tets Product ${i + 1}`,
    quantity: 1,
  }));

  const sim = await req("POST", `/platform/shops/${shopId}/simulate-order`, {
    token: platformToken,
    body: {
      orderNumber: `TETS-SPLIT-${stamp.toString().slice(-6)}`,
      customerName: "Tets Split Customer",
      lineItems,
    },
  });
  const order = sim.data.order || sim.data;
  const orderId = order.id;
  console.log("✓ order", orderId, "lines:", (order.lineItems || lineItems).length);

  let fulfillment = await req("GET", `/company/orders/${orderId}/fulfillment`, { token: companyToken });
  let groups = fulfillment.data.groups || [];
  if (groups.length < 2) {
    console.log("… reallocating");
    const alloc = await req("POST", `/company/orders/${orderId}/allocate`, {
      token: companyToken,
      body: {},
    });
    groups = alloc.data.groups || [];
    if (alloc.data.hold) {
      throw new Error(`order on hold: ${JSON.stringify(alloc.data).slice(0, 300)}`);
    }
  }

  console.log("✓ groups:", groups.length);
  for (const g of groups) {
    const label = g.warehouseId === warehouseAId ? warehouseA.name : g.warehouseId === warehouseBId ? warehouseB.name : g.warehouseId;
    const skus = (g.lines || []).map((l) => `${l.sku}×${l.allocatedQty || l.quantity}`).join(", ");
    console.log(`   - ${label}: ${skus}`);
  }

  assert(groups.length === 2, `expected 2 groups, got ${groups.length}`);
  const groupA = groups.find((g) => g.warehouseId === warehouseAId);
  const groupB = groups.find((g) => g.warehouseId === warehouseBId);
  assert(groupA && (groupA.lines || []).length === 3, "WH-A should have 3 lines");
  assert(groupB && (groupB.lines || []).length === 2, "WH-B should have 2 lines");

  await req("POST", `/company/fulfillment-groups/${groupA.id}/ship`, {
    token: companyToken,
    body: { trackingNumber: `1ZA-TETS-${stamp}`, carrier: "UPS" },
  });
  let mid = await req("GET", `/platform/orders/${orderId}`, { token: platformToken });
  console.log("✓ shipped", warehouseA.name, "→", mid.data.status);
  assert(
    mid.data.status === "partially_fulfilled" || mid.data.status === "945_received",
    `expected partial after first ship, got ${mid.data.status}`
  );

  await req("POST", `/company/fulfillment-groups/${groupB.id}/ship`, {
    token: companyToken,
    body: { trackingNumber: `1ZB-TETS-${stamp}`, carrier: "UPS" },
  });
  const done = await req("GET", `/platform/orders/${orderId}`, { token: platformToken });
  console.log("✓ shipped", warehouseB.name, "→", done.data.status);
  assert(done.data.status === "fulfilled", `expected fulfilled, got ${done.data.status}`);

  const invA = await req("GET", `/company/warehouses/${warehouseAId}/inventory`, { token: companyToken });
  const invB = await req("GET", `/company/warehouses/${warehouseBId}/inventory`, { token: companyToken });
  const onHand = (rows, sku) => {
    const row = (rows.data || []).find((r) => r.sku === sku);
    return row ? Number(row.quantityOnHand) : null;
  };
  for (const sku of skusA) {
    const q = onHand(invA, sku);
    console.log(`   ${warehouseA.name} ${sku}: ${q}`);
    assert(q === 9, `${sku} should be 9, got ${q}`);
  }
  for (const sku of skusB) {
    const q = onHand(invB, sku);
    console.log(`   ${warehouseB.name} ${sku}: ${q}`);
    assert(q === 9, `${sku} should be 9, got ${q}`);
  }

  console.log("\n=== PASS on Tets / ahmadshaukat328@gmail.com ===\n");
  console.log("Order id:", orderId);
  console.log("Login email:", COMPANY_EMAIL);
  console.log("Temp password used for API:", COMPANY_PASSWORD);
  console.log("(Change this password in the portal if you do not want the test password.)");
}

main().catch((err) => {
  console.error("\n=== FAIL ===\n", err.message || err);
  process.exit(1);
});
