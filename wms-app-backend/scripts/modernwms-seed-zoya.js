/**
 * Create a NEW ModernWMS tenant for Zoya, seed master data + sample SKUs.
 *
 *   node scripts/modernwms-seed-zoya.js
 *
 * Env overrides:
 *   MODERNWMS_BASE_URL=https://wms-sys.integritistudio.us
 *   ZOYA_USERNAME=zoya.siddiqui
 *   ZOYA_PASSWORD=ZoyaWms#2026
 *   ZOYA_EMAIL=zoya.siddiqui@integriti.io
 *   SEED_STOCK_QTY=100
 */
const path = require("path");
const crypto = require("crypto");

process.env.MOCK_MODERNWMS = "0";
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { ModernWmsClient } = require("../src/modules/modernwms/client");

const BASE_URL = process.env.MODERNWMS_BASE_URL || "https://wms-sys.integritistudio.us";
const USERNAME = process.env.ZOYA_USERNAME || "zoya.siddiqui";
const PASSWORD = process.env.ZOYA_PASSWORD || "ZoyaWms#2026";
const EMAIL = process.env.ZOYA_EMAIL || "zoya.siddiqui@integriti.io";
const STOCK_QTY = Number(process.env.SEED_STOCK_QTY || 100);

const SEED_SKUS = [
  { barCode: "INT-HOODIE-BLK-S", name: "Integriti Crew Hoodie Black S" },
  { barCode: "INT-HOODIE-BLK-M", name: "Integriti Crew Hoodie Black M" },
  { barCode: "INT-HOODIE-BLK-L", name: "Integriti Crew Hoodie Black L" },
  { barCode: "INT-HOODIE-GRY-M", name: "Integriti Crew Hoodie Gray M" },
  { barCode: "INT-HOODIE-GRY-L", name: "Integriti Crew Hoodie Gray L" },
  { barCode: "INT-CAP-NVY-OS", name: "Integriti Cap Navy OS" },
  { barCode: "INT-CAP-BLK-OS", name: "Integriti Cap Black OS" },
  { barCode: "INT-TOTE-NAT-OS", name: "Integriti Tote Natural OS" },
  { barCode: "INT-BOTTLE-SLV-OS", name: "Integriti Bottle Silver OS" },
];

const nowIso = () => new Date().toISOString();
function md5(text) {
  return crypto.createHash("md5").update(String(text)).digest("hex");
}
function log(step, detail = "") {
  console.log(`  ${step}${detail ? ` — ${detail}` : ""}`);
}

async function rawPost(urlPath, body) {
  const res = await fetch(`${BASE_URL.replace(/\/+$/, "")}/${urlPath.replace(/^\//, "")}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON from ${urlPath}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return json;
}

async function api(client, method, pathName, body) {
  return client.request(pathName, { method, body });
}

async function registerTenant() {
  log("register", `POST /user/register as ${USERNAME}`);
  const json = await rawPost("/user/register", {
    user_name: USERNAME,
    auth_string: md5(PASSWORD),
    email: EMAIL,
    sex: "female",
  });
  const ok = json.isSuccess ?? json.IsSuccess;
  const msg = json.errorMessage || json.ErrorMessage || json.data || json.Data || "";
  if (ok) {
    log("register", `ok — ${typeof msg === "string" ? msg : "success"}`);
    return { created: true };
  }
  const text = String(msg);
  if (/exist|already|username/i.test(text)) {
    log("register", `user already exists — will login and seed (${text})`);
    return { created: false, existed: true };
  }
  throw new Error(`Register failed: ${text || JSON.stringify(json)}`);
}

async function ensureCompany(client) {
  const rows = await api(client, "GET", "/company/all");
  const name = "Integriti Zoya Test";
  const existing = (rows || []).find((r) => r.company_name === name) || rows?.[0];
  if (existing) {
    log("company", `exists id=${existing.id} name=${existing.company_name}`);
    return existing;
  }
  const id = await api(client, "POST", "/company", {
    company_name: name,
    city: "Remote",
    address: "Zoya test tenant",
    manager: "Zoya Siddiqui",
    contact_tel: "",
  });
  log("company", `created id=${id}`);
  return { id, company_name: name };
}

async function ensureCustomer(client) {
  const rows = await api(client, "GET", "/customer/all");
  const name = "Zoya Shopify";
  const existing = (rows || []).find((r) => r.customer_name === name);
  if (existing) {
    log("customer", `exists id=${existing.id}`);
    return existing;
  }
  const id = await api(client, "POST", "/customer", {
    customer_name: name,
    city: "Remote",
    address: "Shopify default ship-to",
    manager: "Zoya",
    email: EMAIL,
    contact_tel: "",
    is_valid: true,
  });
  log("customer", `created id=${id}`);
  return { id, customer_name: name };
}

async function ensureGoodsOwner(client) {
  const rows = await api(client, "GET", "/goodsowner/all");
  const name = "Zoya Owner";
  const existing = (rows || []).find((r) => r.goods_owner_name === name);
  if (existing) {
    log("goods owner", `exists id=${existing.id}`);
    return existing;
  }
  const id = await api(client, "POST", "/goodsowner", {
    goods_owner_name: name,
    city: "Remote",
    address: "Zoya test",
    manager: USERNAME,
    contact_tel: "",
    is_valid: true,
  });
  log("goods owner", `created id=${id}`);
  return { id, goods_owner_name: name };
}

async function ensureWarehouse(client) {
  const rows = await api(client, "GET", "/warehouse/all");
  const name = "Zoya Test WH";
  const existing = (rows || []).find((r) => r.warehouse_name === name) || rows?.[0];
  if (existing) {
    log("warehouse", `using id=${existing.id} name=${existing.warehouse_name}`);
    return existing;
  }
  const id = await api(client, "POST", "/warehouse", {
    warehouse_name: name,
    city: "Remote",
    address: "Zoya test warehouse",
    contact_tel: "",
    email: EMAIL,
    manager: USERNAME,
    is_valid: true,
  });
  log("warehouse", `created id=${id}`);
  return { id, warehouse_name: name };
}

async function ensureCategory(client) {
  const rows = await api(client, "GET", "/category/all");
  const existing = (rows || []).find((r) => r.category_name === "General") || rows?.[0];
  if (existing) {
    log("category", `using id=${existing.id} name=${existing.category_name}`);
    return existing;
  }
  const id = await api(client, "POST", "/category", {
    category_name: "General",
    parent_id: 0,
    is_valid: true,
  });
  log("category", `created id=${id}`);
  return { id, category_name: "General" };
}

async function ensureWarehouseArea(client, warehouse) {
  const rows = await api(client, "GET", `/warehousearea/areas-by-warehouse_id?warehouse_id=${warehouse.id}`);
  if (rows?.length) {
    const area = rows[0];
    return {
      id: Number(area.value ?? area.id),
      area_name: area.label ?? area.area_name ?? "MAIN",
      warehouse_name: warehouse.warehouse_name,
    };
  }
  const id = await api(client, "POST", "/warehousearea", {
    warehouse_id: warehouse.id,
    warehouse_name: warehouse.warehouse_name,
    area_name: "MAIN",
    parent_id: 0,
    area_property: 0,
    is_valid: true,
  });
  log("warehouse area", `created id=${id}`);
  return { id, area_name: "MAIN", warehouse_name: warehouse.warehouse_name };
}

async function ensureLocation(client, warehouse, area) {
  const rows = await api(client, "GET", `/goodslocation/location-by-warehouseare_id?warehousearea_id=${area.id}`);
  if (rows?.length) {
    const loc = rows[0];
    return {
      id: Number(loc.value ?? loc.id),
      location_name: loc.label ?? loc.location_name ?? "A-01",
    };
  }
  const id = await api(client, "POST", "/goodslocation", {
    warehouse_id: warehouse.id,
    warehouse_name: warehouse.warehouse_name,
    warehouse_area_id: area.id,
    warehouse_area_name: area.area_name,
    warehouse_area_property: 0,
    location_name: "A-01",
    is_valid: true,
  });
  log("bin location", `created id=${id}`);
  return { id, location_name: "A-01" };
}

async function ensureSku(client, category, { barCode, name }) {
  try {
    const sku = await client.getSkuByBarCode(barCode);
    if (sku?.sku_id || sku?.id) {
      log("sku", `${barCode} exists sku_id=${sku.sku_id || sku.id}`);
      return { ...sku, sku_id: sku.sku_id || sku.id, bar_code: barCode };
    }
  } catch {
    /* create */
  }

  const spuCode = barCode.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32);
  const spuId = await api(client, "POST", "/spu", {
    spu_code: spuCode,
    spu_name: name,
    category_id: category.id,
    category_name: category.category_name,
    spu_description: `Zoya seed ${barCode}`,
    is_valid: true,
    detailList: [
      {
        sku_code: barCode,
        sku_name: name,
        bar_code: barCode,
        unit: "ea",
        price: 0,
        cost: 0,
      },
    ],
  });

  const created = await client.getSkuByBarCode(barCode);
  log("sku", `${barCode} created spu_id=${spuId} sku_id=${created.sku_id || created.id}`);
  return { ...created, sku_id: created.sku_id || created.id, bar_code: barCode };
}

async function receiveStock(client, { goodsOwner, location, skus }) {
  const existing = await client.stockList({ pageIndex: 1, pageSize: 500 });
  const needStock = skus.filter(({ barCode }) => {
    const row = existing.find((r) => String(r.sku_code || r.bar_code || "") === barCode);
    return !row || Number(row.qty || 0) < 10;
  });

  if (!needStock.length) {
    log("stock", "all SKUs already stocked — skip ASN");
    return;
  }

  const detailList = needStock.map((item) => ({
    spu_id: item.spu_id,
    spu_code: item.spu_code || item.bar_code,
    spu_name: item.sku_name || item.bar_code,
    sku_id: item.sku_id,
    sku_code: item.bar_code,
    sku_name: item.sku_name || item.bar_code,
    asn_qty: STOCK_QTY,
    actual_qty: 0,
    is_valid: true,
  }));

  const masterId = await api(client, "POST", "/asn/asnmaster", {
    asn_batch: `ZOYA-${Date.now()}`,
    estimated_arrival_time: nowIso(),
    goods_owner_id: goodsOwner.id,
    goods_owner_name: goodsOwner.goods_owner_name,
    detailList,
  });
  log("asn", `created master id=${masterId}`);

  const master = await api(client, "GET", `/asn/asnmaster?id=${masterId}`);
  const lines = master.detailList || [];
  if (!lines.length) throw new Error("ASN has no lines");

  const ts = nowIso();
  await api(client, "PUT", "/asn/confirm", lines.map((line) => ({ id: line.id, arrival_time: ts })));
  await api(client, "PUT", "/asn/unload", lines.map((line) => ({
    id: line.id,
    unload_time: ts,
    unload_person: "zoya-seed",
  })));

  for (const line of lines) {
    await api(client, "PUT", "/asn/sorting", [{
      asn_id: line.id,
      sorted_qty: line.asn_qty || STOCK_QTY,
      is_auto_num: false,
      series_number: `ZOYA-${line.sku_code || line.id}`,
    }]);
  }
  await api(client, "PUT", "/asn/sorted", lines.map((line) => line.id));

  for (const line of lines) {
    const pending = await api(client, "GET", `/asn/pending-putaway?id=${line.id}`);
    if (!pending?.length) throw new Error(`No pending putaway for asn ${line.id}`);
    await api(client, "PUT", "/asn/putaway", [{
      asn_id: line.id,
      goods_owner_id: goodsOwner.id,
      goods_location_id: location.id,
      putaway_qty: pending[0].sorted_qty,
      series_number: pending[0].series_number || "",
    }]);
  }
  log("asn", `putaway complete (+${STOCK_QTY} each for ${needStock.length} SKUs)`);
}

async function main() {
  console.log("\n=== ModernWMS Zoya tenant seed ===\n");
  console.log(`Target: ${BASE_URL}`);

  const reg = await registerTenant();

  const client = new ModernWmsClient({ baseUrl: BASE_URL, username: USERNAME, password: PASSWORD });
  const conn = await client.testConnection();
  log("login", `tenant_id=${conn.tenantId}`);

  const company = await ensureCompany(client);
  const customer = await ensureCustomer(client);
  const goodsOwner = await ensureGoodsOwner(client);
  const warehouse = await ensureWarehouse(client);
  const category = await ensureCategory(client);
  const area = await ensureWarehouseArea(client, warehouse);
  const location = await ensureLocation(client, warehouse, area);

  const skus = [];
  for (const def of SEED_SKUS) {
    skus.push(await ensureSku(client, category, def));
  }

  await receiveStock(client, { goodsOwner, location, skus });

  const stock = await client.stockList({ pageIndex: 1, pageSize: 500 });

  console.log("\n========== ZOYA CREDENTIALS / IDs ==========\n");
  console.log(`ModernWMS URL:     ${BASE_URL}`);
  console.log(`Username:          ${USERNAME}`);
  console.log(`Password:          ${PASSWORD}`);
  console.log(`Email:             ${EMAIL}`);
  console.log(`Tenant created:    ${reg.created ? "yes" : "no (already existed)"}`);
  console.log(`Tenant ID:         ${conn.tenantId}`);
  console.log(`Company ID:        ${company.id} (${company.company_name})`);
  console.log(`Warehouse ID:      ${warehouse.id} (${warehouse.warehouse_name})`);
  console.log(`Area ID:           ${area.id} (${area.area_name})`);
  console.log(`Location ID:       ${location.id} (${location.location_name})`);
  console.log(`Customer ID:       ${customer.id} (${customer.customer_name})`);
  console.log(`Goods owner ID:    ${goodsOwner.id} (${goodsOwner.goods_owner_name})`);
  console.log(`Category ID:       ${category.id} (${category.category_name})`);
  console.log("\nLinker warehouse ModernWMS fields:");
  console.log(`  baseUrl:            ${BASE_URL}`);
  console.log(`  username:           ${USERNAME}`);
  console.log(`  password:           ${PASSWORD}`);
  console.log(`  tenantId:           ${conn.tenantId}`);
  console.log(`  defaultCustomerId:  ${customer.id}`);
  console.log(`  goodsOwnerId:       ${goodsOwner.id}`);
  console.log(`  autoConfirmOrder:   false`);
  console.log("\nStock:");
  for (const def of SEED_SKUS) {
    const row = stock.find((r) => String(r.sku_code || r.bar_code || "") === def.barCode);
    const sku = skus.find((s) => s.bar_code === def.barCode || s.sku_code === def.barCode);
    console.log(
      `  ${def.barCode}: sku_id=${sku?.sku_id ?? "?"} qty=${row?.qty ?? 0} avail=${row?.qty_available ?? row?.qty ?? 0}`
    );
  }
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error("\nZoya seed failed:", err.stack || err.message || err);
  process.exit(1);
});
