/**
 * Split-fulfillment scenario:
 * Order with 5 SKUs — WH-A has 3, WH-B has 2 → allocate splits → ship both → fulfilled
 *
 * Run: node scripts/split-fulfillment-case.js
 */
const BASE = process.env.API_URL || "http://localhost:3000";

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 400 || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const stamp = Date.now();
  console.log(`\n=== Split fulfillment case @ ${BASE} ===\n`);

  const login = await req("POST", "/platform/auth/login", {
    body: { username: "platform", password: "change-me-now" },
  });
  const platformToken = login.data.token;
  console.log("✓ platform login");

  const email = `split-${stamp}@example.com`;
  const password = "SplitTest123!";
  const created = await req("POST", "/platform/companies", {
    token: platformToken,
    body: { name: `Split Co ${stamp}`, email, notes: "split fulfillment scenario" },
  });
  const companyId = created.data.company.id;
  const inviteUrl = created.data.inviteUrl || "";
  const inviteToken = inviteUrl.match(/\/invite\/([^/?#]+)/)?.[1];
  console.log("✓ company", companyId);

  if (inviteToken) {
    await req("POST", "/company/auth/set-password", {
      body: { token: inviteToken, password },
    });
  } else {
    // bootstrap via DB if invite was emailed only
    require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
    const bcrypt = require("bcrypt");
    const { connectDb, disconnectDb } = require("../src/db/connect");
    const Company = require("../src/modules/companies/model");
    const members = require("../src/modules/companies/members");
    await connectDb();
    const company = await Company.findById(companyId);
    const member = await members.ensureRootMember(company);
    const hashed = await bcrypt.hash(password, 10);
    member.password = hashed;
    member.status = "active";
    await member.save();
    company.password = hashed;
    company.status = "active";
    await company.save();
    await disconnectDb();
  }

  const companyLogin = await req("POST", "/company/auth/login", {
    body: { email, password },
  });
  const companyToken = companyLogin.data.token;
  console.log("✓ company login");

  const shopRes = await req("POST", `/platform/companies/${companyId}/shops`, {
    token: platformToken,
    body: { shopDomain: `split-${stamp}.myshopify.com` },
  });
  const shopId = shopRes.data.id || shopRes.data.shop?.id;

  const whA = await req("POST", `/platform/companies/${companyId}/warehouses`, {
    token: platformToken,
    body: { name: "Warehouse A", code: "WH-A", address: "A Street" },
  });
  const whB = await req("POST", `/platform/companies/${companyId}/warehouses`, {
    token: platformToken,
    body: { name: "Warehouse B", code: "WH-B", address: "B Street" },
  });
  const warehouseAId = whA.data.id || whA.data.warehouse?.id;
  const warehouseBId = whB.data.id || whB.data.warehouse?.id;
  console.log("✓ warehouses", { warehouseAId, warehouseBId });

  // Routing: allow split (ship_available), prefer A but A cannot cover all
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
  console.log("✓ routing config (partialPolicy=ship_available, default=WH-A)");

  const skusA = ["SPLIT-SKU-1", "SPLIT-SKU-2", "SPLIT-SKU-3"];
  const skusB = ["SPLIT-SKU-4", "SPLIT-SKU-5"];

  await req("PUT", `/company/warehouses/${warehouseAId}/inventory`, {
    token: companyToken,
    body: {
      items: skusA.map((sku) => ({ sku, quantityOnHand: 10 })),
    },
  });
  await req("PUT", `/company/warehouses/${warehouseBId}/inventory`, {
    token: companyToken,
    body: {
      items: skusB.map((sku) => ({ sku, quantityOnHand: 10 })),
    },
  });
  console.log("✓ inventory seeded — WH-A:", skusA.join(", "), "| WH-B:", skusB.join(", "));

  const lineItems = [...skusA, ...skusB].map((sku, i) => ({
    sku,
    title: `Product ${i + 1}`,
    quantity: 1,
  }));

  const sim = await req("POST", `/platform/shops/${shopId}/simulate-order`, {
    token: platformToken,
    body: {
      orderNumber: `SPLIT-${stamp.toString().slice(-6)}`,
      customerName: "Split Customer",
      lineItems,
    },
  });
  const order = sim.data.order || sim.data;
  const orderId = order.id;
  console.log("✓ order created", orderId, "lines:", order.lineItems?.length || lineItems.length);

  // Ensure allocate (simulate may already forceAllocate)
  let fulfillment = await req("GET", `/company/orders/${orderId}/fulfillment`, { token: companyToken });
  let groups = fulfillment.data.groups || [];
  if (groups.length < 2) {
    console.log("… reallocating");
    const alloc = await req("POST", `/company/orders/${orderId}/allocate`, {
      token: companyToken,
      body: {},
    });
    groups = alloc.data.groups || [];
  }

  console.log("✓ fulfillment groups:", groups.length);
  for (const g of groups) {
    const wh = g.warehouseId === warehouseAId ? "WH-A" : g.warehouseId === warehouseBId ? "WH-B" : g.warehouseId;
    const skus = (g.lines || []).map((l) => `${l.sku}×${l.allocatedQty || l.quantity}`).join(", ");
    console.log(`   - ${wh} [${g.status}]: ${skus}`);
  }

  assert(groups.length === 2, `expected 2 groups, got ${groups.length}`);

  const groupA = groups.find((g) => g.warehouseId === warehouseAId);
  const groupB = groups.find((g) => g.warehouseId === warehouseBId);
  assert(groupA, "missing WH-A group");
  assert(groupB, "missing WH-B group");
  assert((groupA.lines || []).length === 3, `WH-A should have 3 lines, got ${groupA.lines?.length}`);
  assert((groupB.lines || []).length === 2, `WH-B should have 2 lines, got ${groupB.lines?.length}`);

  // Ship WH-A only → partially_fulfilled
  await req("POST", `/company/fulfillment-groups/${groupA.id}/ship`, {
    token: companyToken,
    body: { trackingNumber: `1ZA-${stamp}`, carrier: "UPS" },
  });
  let afterA = await req("GET", `/platform/orders/${orderId}`, { token: platformToken });
  const statusAfterA = afterA.data.status;
  console.log("✓ shipped WH-A → order status:", statusAfterA);
  assert(
    statusAfterA === "partially_fulfilled" || statusAfterA === "945_received",
    `expected partially_fulfilled after first ship, got ${statusAfterA}`
  );

  // Ship WH-B → fulfilled
  await req("POST", `/company/fulfillment-groups/${groupB.id}/ship`, {
    token: companyToken,
    body: { trackingNumber: `1ZB-${stamp}`, carrier: "UPS" },
  });
  const afterB = await req("GET", `/platform/orders/${orderId}`, { token: platformToken });
  console.log("✓ shipped WH-B → order status:", afterB.data.status);
  assert(afterB.data.status === "fulfilled", `expected fulfilled, got ${afterB.data.status}`);

  const invA = await req("GET", `/company/warehouses/${warehouseAId}/inventory`, { token: companyToken });
  const invB = await req("GET", `/company/warehouses/${warehouseBId}/inventory`, { token: companyToken });
  const onHand = (rows, sku) => {
    const row = (rows.data || []).find((r) => r.sku === sku);
    return row ? Number(row.quantityOnHand) : null;
  };
  for (const sku of skusA) {
    const q = onHand(invA, sku);
    console.log(`   stock WH-A ${sku}: ${q}`);
    assert(q === 9, `${sku} on WH-A should be 9 after ship, got ${q}`);
  }
  for (const sku of skusB) {
    const q = onHand(invB, sku);
    console.log(`   stock WH-B ${sku}: ${q}`);
    assert(q === 9, `${sku} on WH-B should be 9 after ship, got ${q}`);
  }

  console.log("\n=== PASS: split allocate → partial ship → fulfilled + inventory decremented ===\n");
  console.log("Company login:", email, "/", password);
  console.log("Order id:", orderId);
}

main().catch((err) => {
  console.error("\n=== FAIL ===\n", err.message || err);
  process.exit(1);
});
