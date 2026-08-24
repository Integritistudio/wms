/**
 * 945-driven shipment lifecycle + split return/fail cases.
 *
 * By default runs on the existing Tets company (same as split-on-tets-company.js).
 *
 * Covers:
 *  1. Full path: labeled → in_transit → out_for_delivery → delivered → returned (RMA)
 *  2. Delivery failed via 945
 *  3. Split: one package delivered, one failed
 *  4. Split: both packages fully returned
 *  5. Split: one package returned, one stays delivered
 *
 * Run (API must be up):
 *   node scripts/945-lifecycle-cases.js
 *   COMPANY_EMAIL=... COMPANY_PASSWORD=... node scripts/945-lifecycle-cases.js
 *   CREATE_NEW_COMPANY=1 node scripts/945-lifecycle-cases.js
 */
const path = require("path");
const bcrypt = require("bcrypt");

const BASE = process.env.API_URL || "http://localhost:3000";
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || "ahmadshaukat328@gmail.com";
const COMPANY_PASSWORD = process.env.COMPANY_PASSWORD || "TestSplit123!";
const CREATE_NEW_COMPANY = process.env.CREATE_NEW_COMPANY === "1";
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

async function req(method, pathName, { token, body, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    payload = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${pathName}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 400 || json.success === false) {
    throw new Error(`${method} ${pathName} → ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
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

/** Upload / apply a 945 JSON status update (or first ship). */
async function apply945Json(companyToken, orderId, payload) {
  return req("POST", `/company/orders/${orderId}/945`, {
    token: companyToken,
    body: payload,
  });
}

async function getFulfillment(companyToken, orderId) {
  const res = await req("GET", `/company/orders/${orderId}/fulfillment`, { token: companyToken });
  return res.data;
}

async function setupExistingCompany(platformToken) {
  const companies = await req("GET", "/platform/companies", { token: platformToken });
  const company = (companies.data || []).find(
    (c) => String(c.email || "").toLowerCase() === COMPANY_EMAIL.toLowerCase()
      || String(c.name || "").toLowerCase() === "tets"
      || String(c.name || "").toLowerCase() === "test",
  );
  assert(company, `company not found for ${COMPANY_EMAIL} / Tets / test`);
  const companyId = company.id;
  console.log("✓ using existing company", company.name, companyId, company.email);

  const detail = await req("GET", `/platform/companies/${companyId}`, { token: platformToken });
  let shopId = detail.data.shops?.[0]?.id;
  if (!shopId) {
    const shopRes = await req("POST", `/platform/companies/${companyId}/shops`, {
      token: platformToken,
      body: { shopDomain: `tets-life-${Date.now()}.myshopify.com` },
    });
    shopId = shopRes.data.id || shopRes.data.shop?.id;
  }
  console.log("✓ shop", shopId);

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

  return {
    companyId,
    companyToken,
    shopId,
    email: COMPANY_EMAIL,
    password: COMPANY_PASSWORD,
    warehouses: detail.data.warehouses || [],
  };
}

async function setupNewCompany(platformToken, stamp, label) {
  const email = `life-${label}-${stamp}@example.com`;
  const password = "LifeTest123!";
  const created = await req("POST", "/platform/companies", {
    token: platformToken,
    body: { name: `Life ${label} ${stamp}`, email, notes: `945 lifecycle ${label}` },
  });
  const companyId = created.data.company.id;
  const inviteUrl = created.data.inviteUrl || "";
  const inviteToken = inviteUrl.match(/\/invite\/([^/?#]+)/)?.[1];
  if (inviteToken) {
    await req("POST", "/company/auth/set-password", { body: { token: inviteToken, password } });
  } else {
    await ensureCompanyPassword(companyId, email, password);
  }
  const companyLogin = await req("POST", "/company/auth/login", { body: { email, password } });
  const companyToken = companyLogin.data.token;

  const shopRes = await req("POST", `/platform/companies/${companyId}/shops`, {
    token: platformToken,
    body: { shopDomain: `life-${label}-${stamp}.myshopify.com` },
  });
  const shopId = shopRes.data.id || shopRes.data.shop?.id;

  return { companyId, companyToken, shopId, email, password, warehouses: [] };
}

async function addWarehouse(platformToken, companyId, name, code, reuseList = []) {
  const existing = (reuseList || []).find(
    (w) => String(w.code || "").toUpperCase() === String(code).toUpperCase()
      || String(w.name || "").toLowerCase() === String(name).toLowerCase(),
  );
  if (existing) return existing.id;

  const wh = await req("POST", `/platform/companies/${companyId}/warehouses`, {
    token: platformToken,
    body: { name, code, address: `${name} St` },
  });
  const id = wh.data.id || wh.data.warehouse?.id;
  if (reuseList && id) {
    reuseList.push({ id, name, code });
  }
  return id;
}

async function seedInventory(companyToken, warehouseId, skus, qty = 20) {
  await req("PUT", `/company/warehouses/${warehouseId}/inventory`, {
    token: companyToken,
    body: { items: skus.map((sku) => ({ sku, quantityOnHand: qty })) },
  });
}

async function enableRouting(companyToken, defaultWarehouseId) {
  await req("PUT", "/company/routing/config", {
    token: companyToken,
    body: {
      enabled: true,
      autoAssignOnReceive: true,
      autoDeliverSftp: false,
      defaultWarehouseId,
      fallbackWarehouseId: null,
      partialPolicy: "ship_available",
      addressMode: "off",
    },
  });
}

async function simulateOrder(platformToken, shopId, orderNumber, lineItems) {
  const sim = await req("POST", `/platform/shops/${shopId}/simulate-order`, {
    token: platformToken,
    body: {
      orderNumber,
      customerName: "Lifecycle Tester",
      lineItems,
      shippingAddress: {
        name: "Lifecycle Tester",
        address1: "100 Test Ave",
        city: "Austin",
        provinceCode: "TX",
        zip: "78701",
        countryCode: "US",
      },
    },
  });
  return sim.data.order || sim.data;
}

async function ensureAllocated(companyToken, orderId, minGroups = 1) {
  let fulfillment = await getFulfillment(companyToken, orderId);
  if ((fulfillment.groups || []).length < minGroups) {
    await req("POST", `/company/orders/${orderId}/allocate`, { token: companyToken, body: {} });
    fulfillment = await getFulfillment(companyToken, orderId);
  }
  return fulfillment;
}

function shipmentForGroup(fulfillment, groupId) {
  return (fulfillment.shipments || []).find((s) => s.fulfillmentGroupId === groupId);
}

async function caseHappyPath945(ctx) {
  const name = "1) Happy path 945: labeled→transit→OFD→delivered→returned";
  try {
    const { platformToken, companyToken, shopId } = ctx;
    const stamp = Date.now();
    const whId = await addWarehouse(platformToken, ctx.companyId, "Main WH", "MAIN", ctx.warehouses);
    await enableRouting(companyToken, whId);
    await seedInventory(companyToken, whId, ["LIFE-SKU-1", "LIFE-SKU-2"]);

    const order = await simulateOrder(platformToken, shopId, `HP-${stamp.toString().slice(-6)}`, [
      { sku: "LIFE-SKU-1", title: "Item 1", quantity: 1 },
      { sku: "LIFE-SKU-2", title: "Item 2", quantity: 1 },
    ]);
    const orderId = order.id;
    const fulfillment0 = await ensureAllocated(companyToken, orderId, 1);
    assert((fulfillment0.groups || []).length >= 1, "expected at least 1 group");
    const groupId = fulfillment0.groups[0].id;
    const tracking = `1ZHP${stamp}`;

    // Ship via 945 JSON (creates labeled)
    await apply945Json(companyToken, orderId, {
      trackingNumber: tracking,
      carrier: "UPS",
      status: "labeled",
      fulfillmentGroupId: groupId,
    });
    let f = await getFulfillment(companyToken, orderId);
    let ship = shipmentForGroup(f, groupId);
    assert(ship, "shipment missing after ship");
    assert(ship.status === "labeled", `expected labeled, got ${ship.status}`);

    for (const status of ["in_transit", "out_for_delivery", "delivered"]) {
      await apply945Json(companyToken, orderId, {
        trackingNumber: tracking,
        carrier: "UPS",
        status,
        fulfillmentGroupId: groupId,
      });
      f = await getFulfillment(companyToken, orderId);
      ship = shipmentForGroup(f, groupId);
      assert(ship.status === status, `expected ${status}, got ${ship.status}`);
    }

    // Delivered → returned via 945 (customer return)
    await apply945Json(companyToken, orderId, {
      trackingNumber: tracking,
      carrier: "UPS",
      status: "returned",
      fulfillmentGroupId: groupId,
    });
    f = await getFulfillment(companyToken, orderId);
    ship = shipmentForGroup(f, groupId);
    assert(ship.status === "returned", `expected returned, got ${ship.status}`);
    assert((f.returns || []).length >= 1, "expected auto RMA after return");
    const history = (ship.statusHistory || []).map((h) => h.status);
    assert(history.includes("in_transit") && history.includes("delivered") && history.includes("returned"), `history incomplete: ${history.join(",")}`);
    const from945 = (ship.statusHistory || []).filter((h) => h.source === "edi945");
    assert(from945.length >= 1, "expected statusHistory source edi945");

    ok(name, `order ${orderId} RMA ${(f.returns || [])[0]?.rmaNumber || ""}`);
  } catch (err) {
    fail(name, err.message);
  }
}

async function caseDeliveryFailed945(ctx) {
  const name = "2) Delivery failed via 945";
  try {
    const { platformToken, companyToken, shopId, companyId } = ctx;
    const stamp = Date.now();
    const whId = await addWarehouse(platformToken, companyId, "Fail WH", "FAIL", ctx.warehouses);
    await enableRouting(companyToken, whId);
    await seedInventory(companyToken, whId, ["FAIL-SKU"]);

    const order = await simulateOrder(platformToken, shopId, `FL-${stamp.toString().slice(-6)}`, [
      { sku: "FAIL-SKU", title: "Fail Item", quantity: 1 },
    ]);
    const fulfillment0 = await ensureAllocated(companyToken, order.id, 1);
    const groupId = fulfillment0.groups[0].id;
    const tracking = `1ZFL${stamp}`;

    await apply945Json(companyToken, order.id, {
      trackingNumber: tracking,
      status: "labeled",
      fulfillmentGroupId: groupId,
    });
    await apply945Json(companyToken, order.id, {
      trackingNumber: tracking,
      status: "in_transit",
      fulfillmentGroupId: groupId,
    });
    await apply945Json(companyToken, order.id, {
      trackingNumber: tracking,
      status: "failed",
      fulfillmentGroupId: groupId,
    });

    const f = await getFulfillment(companyToken, order.id);
    const ship = shipmentForGroup(f, groupId);
    assert(ship.status === "failed", `expected failed, got ${ship.status}`);
    ok(name, `order ${order.id}`);
  } catch (err) {
    fail(name, err.message);
  }
}

async function caseSplitPartialFailed(ctx) {
  const name = "3) Split: one delivered, one failed";
  try {
    const { platformToken, companyToken, shopId, companyId } = ctx;
    const stamp = Date.now();
    const whA = await addWarehouse(platformToken, companyId, "SplitA", "SA", ctx.warehouses);
    const whB = await addWarehouse(platformToken, companyId, "SplitB", "SB", ctx.warehouses);
    await enableRouting(companyToken, whA);
    await seedInventory(companyToken, whA, ["SP-A1", "SP-A2"]);
    await seedInventory(companyToken, whB, ["SP-B1"]);

    const order = await simulateOrder(platformToken, shopId, `SF-${stamp.toString().slice(-6)}`, [
      { sku: "SP-A1", title: "A1", quantity: 1 },
      { sku: "SP-A2", title: "A2", quantity: 1 },
      { sku: "SP-B1", title: "B1", quantity: 1 },
    ]);
    const fulfillment0 = await ensureAllocated(companyToken, order.id, 2);
    assert(fulfillment0.groups.length === 2, `expected 2 groups, got ${fulfillment0.groups.length}`);
    const groupA = fulfillment0.groups.find((g) => g.warehouseId === whA);
    const groupB = fulfillment0.groups.find((g) => g.warehouseId === whB);
    assert(groupA && groupB, "missing split groups");

    const trackA = `1ZSA${stamp}`;
    const trackB = `1ZSB${stamp}`;

    await apply945Json(companyToken, order.id, { trackingNumber: trackA, status: "labeled", fulfillmentGroupId: groupA.id });
    await apply945Json(companyToken, order.id, { trackingNumber: trackB, status: "labeled", fulfillmentGroupId: groupB.id });

    for (const status of ["in_transit", "out_for_delivery", "delivered"]) {
      await apply945Json(companyToken, order.id, { trackingNumber: trackA, status, fulfillmentGroupId: groupA.id });
    }
    await apply945Json(companyToken, order.id, { trackingNumber: trackB, status: "in_transit", fulfillmentGroupId: groupB.id });
    await apply945Json(companyToken, order.id, { trackingNumber: trackB, status: "failed", fulfillmentGroupId: groupB.id });

    const f = await getFulfillment(companyToken, order.id);
    const shipA = shipmentForGroup(f, groupA.id);
    const shipB = shipmentForGroup(f, groupB.id);
    assert(shipA.status === "delivered", `A expected delivered, got ${shipA.status}`);
    assert(shipB.status === "failed", `B expected failed, got ${shipB.status}`);
    assert(f.order.status === "fulfilled", `order should be fulfilled (both groups shipped), got ${f.order.status}`);
    ok(name, `A=${shipA.status} B=${shipB.status}`);
  } catch (err) {
    fail(name, err.message);
  }
}

async function caseSplitFullyReturned(ctx) {
  const name = "4) Split: both packages fully returned";
  try {
    const { platformToken, companyToken, shopId, companyId } = ctx;
    const stamp = Date.now();
    const whA = await addWarehouse(platformToken, companyId, "RetA", "RA", ctx.warehouses);
    const whB = await addWarehouse(platformToken, companyId, "RetB", "RB", ctx.warehouses);
    await enableRouting(companyToken, whA);
    await seedInventory(companyToken, whA, ["RT-A1"]);
    await seedInventory(companyToken, whB, ["RT-B1"]);

    const order = await simulateOrder(platformToken, shopId, `FR-${stamp.toString().slice(-6)}`, [
      { sku: "RT-A1", title: "A", quantity: 1 },
      { sku: "RT-B1", title: "B", quantity: 1 },
    ]);
    const fulfillment0 = await ensureAllocated(companyToken, order.id, 2);
    const groupA = fulfillment0.groups.find((g) => g.warehouseId === whA);
    const groupB = fulfillment0.groups.find((g) => g.warehouseId === whB);
    const trackA = `1ZRA${stamp}`;
    const trackB = `1ZRB${stamp}`;

    for (const [groupId, tracking] of [
      [groupA.id, trackA],
      [groupB.id, trackB],
    ]) {
      await apply945Json(companyToken, order.id, { trackingNumber: tracking, status: "labeled", fulfillmentGroupId: groupId });
      for (const status of ["in_transit", "delivered", "returned"]) {
        await apply945Json(companyToken, order.id, { trackingNumber: tracking, status, fulfillmentGroupId: groupId });
      }
    }

    const f = await getFulfillment(companyToken, order.id);
    const shipA = shipmentForGroup(f, groupA.id);
    const shipB = shipmentForGroup(f, groupB.id);
    assert(shipA.status === "returned" && shipB.status === "returned", `expected both returned, got ${shipA.status}/${shipB.status}`);
    assert((f.returns || []).length >= 2, `expected 2 RMAs, got ${(f.returns || []).length}`);
    ok(name, `RMAs=${(f.returns || []).length}`);
  } catch (err) {
    fail(name, err.message);
  }
}

async function caseSplitPartiallyReturned(ctx) {
  const name = "5) Split: one returned, one stays delivered";
  try {
    const { platformToken, companyToken, shopId, companyId } = ctx;
    const stamp = Date.now();
    const whA = await addWarehouse(platformToken, companyId, "PR A", "PA", ctx.warehouses);
    const whB = await addWarehouse(platformToken, companyId, "PR B", "PB", ctx.warehouses);
    await enableRouting(companyToken, whA);
    await seedInventory(companyToken, whA, ["PR-A1"]);
    await seedInventory(companyToken, whB, ["PR-B1"]);

    const order = await simulateOrder(platformToken, shopId, `PR-${stamp.toString().slice(-6)}`, [
      { sku: "PR-A1", title: "A", quantity: 1 },
      { sku: "PR-B1", title: "B", quantity: 1 },
    ]);
    const fulfillment0 = await ensureAllocated(companyToken, order.id, 2);
    const groupA = fulfillment0.groups.find((g) => g.warehouseId === whA);
    const groupB = fulfillment0.groups.find((g) => g.warehouseId === whB);
    const trackA = `1ZPA${stamp}`;
    const trackB = `1ZPB${stamp}`;

    for (const [groupId, tracking] of [
      [groupA.id, trackA],
      [groupB.id, trackB],
    ]) {
      await apply945Json(companyToken, order.id, { trackingNumber: tracking, status: "labeled", fulfillmentGroupId: groupId });
      for (const status of ["in_transit", "delivered"]) {
        await apply945Json(companyToken, order.id, { trackingNumber: tracking, status, fulfillmentGroupId: groupId });
      }
    }

    // Only A returns
    await apply945Json(companyToken, order.id, {
      trackingNumber: trackA,
      status: "returned",
      fulfillmentGroupId: groupA.id,
    });

    const f = await getFulfillment(companyToken, order.id);
    const shipA = shipmentForGroup(f, groupA.id);
    const shipB = shipmentForGroup(f, groupB.id);
    assert(shipA.status === "returned", `A expected returned, got ${shipA.status}`);
    assert(shipB.status === "delivered", `B expected delivered, got ${shipB.status}`);
    assert((f.returns || []).length === 1, `expected 1 RMA, got ${(f.returns || []).length}`);
    ok(name, `A=returned B=delivered`);
  } catch (err) {
    fail(name, err.message);
  }
}

async function caseX12Body945(ctx) {
  const name = "6) Raw X12 945 body with AT7 status";
  try {
    const { platformToken, companyToken, shopId, companyId } = ctx;
    const stamp = Date.now();
    const whId = await addWarehouse(platformToken, companyId, "X12 WH", "X12", ctx.warehouses);
    await enableRouting(companyToken, whId);
    await seedInventory(companyToken, whId, ["X12-SKU"]);

    const order = await simulateOrder(platformToken, shopId, `X12-${stamp.toString().slice(-6)}`, [
      { sku: "X12-SKU", title: "X12 Item", quantity: 1 },
    ]);
    const fulfillment0 = await ensureAllocated(companyToken, order.id, 1);
    const groupId = fulfillment0.groups[0].id;
    const tracking = `1ZX12${stamp}`;

    // First ship
    await apply945Json(companyToken, order.id, {
      trackingNumber: tracking,
      status: "labeled",
      fulfillmentGroupId: groupId,
    });

    // Status update using X12 text (AT7)
    const x12Body = [
      "ISA*00*          *00*          *ZZ*WAREHOUSE      *ZZ*WMSLINKER      *250821*1200*U*00401*000000001*0*P*>",
      "GS*SW*WAREHOUSE*WMSLINKER*20250821*1200*1*X*004010",
      "ST*945*0001",
      `W06*N*${order.orderNumber}*${tracking}`,
      "W27*B*UPS*CC***" + tracking,
      "MAN*GM*" + tracking,
      "AT7*AF*in_transit*20250821*1205",
      "SE*6*0001",
      "GE*1*1",
      "IEA*1*000000001",
    ].join("~\n") + "~\n";

    await apply945Json(companyToken, order.id, {
      body: x12Body,
      trackingNumber: tracking,
      fulfillmentGroupId: groupId,
      fileName: `945-at7-${stamp}.edi`,
    });

    const f = await getFulfillment(companyToken, order.id);
    const ship = shipmentForGroup(f, groupId);
    assert(ship.status === "in_transit", `expected in_transit from AT7, got ${ship.status}`);
    ok(name, "AT7 parsed");
  } catch (err) {
    fail(name, err.message);
  }
}

async function main() {
  console.log(`\n=== 945 lifecycle cases @ ${BASE} ===\n`);

  const login = await req("POST", "/platform/auth/login", {
    body: { username: "platform", password: "change-me-now" },
  });
  const platformToken = login.data.token;
  console.log("✓ platform login\n");

  const stamp = Date.now();
  const base = CREATE_NEW_COMPANY
    ? await setupNewCompany(platformToken, stamp, "shared")
    : await setupExistingCompany(platformToken);
  const ctx = { ...base, platformToken, warehouses: base.warehouses || [] };
  console.log("✓ company", base.companyId, base.email);
  console.log(`✓ mode: ${CREATE_NEW_COMPANY ? "new company" : "existing test company"}\n`);

  await caseHappyPath945(ctx);
  await caseDeliveryFailed945(ctx);
  await caseSplitPartialFailed(ctx);
  await caseSplitFullyReturned(ctx);
  await caseSplitPartiallyReturned(ctx);
  await caseX12Body945(ctx);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
  console.log(`Company: ${base.email} (${base.companyId})\n`);
  if (failed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n=== FATAL ===\n", err);
  process.exit(1);
});
