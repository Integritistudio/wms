/**
 * Seed live ModernWMS with master data + stock for wms-linker integration.
 *
 *   node scripts/modernwms-seed-live.js
 *
 * Optional env:
 *   MODERNWMS_BASE_URL=https://wms-sys.integritistudio.us
 *   MODERNWMS_USERNAME=admin
 *   MODERNWMS_PASSWORD=1
 *   LINKER_WAREHOUSE_ID=6a8cacac9e9e75c3c56b340d
 *   SKIP_LINKER_CONFIG=1
 */
const path = require("path");

process.env.MOCK_MODERNWMS = "0";
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { ModernWmsClient } = require("../src/modules/modernwms/client");
const { encrypt } = require("../src/utils/secret");

const BASE_URL = process.env.MODERNWMS_BASE_URL || "https://wms-sys.integritistudio.us";
const USERNAME = process.env.MODERNWMS_USERNAME || "admin";
const PASSWORD = process.env.MODERNWMS_PASSWORD || "1";
const LINKER_WAREHOUSE_ID = process.env.LINKER_WAREHOUSE_ID || "6a8cacac9e9e75c3c56b340d";
const SKIP_LINKER = process.env.SKIP_LINKER_CONFIG === "1";

const SEED_SKUS = [
  { barCode: "RT-SMOKE-1", name: "Routing Smoke 1" },
  { barCode: "RT-SMOKE-2", name: "Routing Smoke 2" },
  { barCode: "RT-RULE-SKU", name: "Routing Rule SKU" },
  { barCode: "SMOKE-SKU", name: "Smoke SKU" },
  { barCode: "SKU-A", name: "SKU A" },
  { barCode: "SKU-B", name: "SKU B" },
];

const STOCK_QTY = Number(process.env.SEED_STOCK_QTY || 500);
const nowIso = () => new Date().toISOString();

function log(step, detail = "") {
  console.log(`  ${step}${detail ? ` — ${detail}` : ""}`);
}

async function api(client, method, path, body) {
  return client.request(path, { method, body });
}

async function ensureCustomer(client) {
  const rows = await api(client, "GET", "/customer/all");
  const existing = rows.find((r) => r.customer_name === "Integriti Shopify");
  if (existing) {
    log("customer", `exists id=${existing.id}`);
    return existing;
  }
  const id = await api(client, "POST", "/customer", {
    customer_name: "Integriti Shopify",
    city: "Remote",
    address: "Shopify default ship-to",
    manager: "Integriti",
    email: "ops@integritistudio.us",
    contact_tel: "",
    is_valid: true,
  });
  log("customer", `created id=${id}`);
  return { id, customer_name: "Integriti Shopify" };
}

async function ensureGoodsOwner(client) {
  const rows = await api(client, "GET", "/goodsowner/all");
  const existing = rows.find((r) => r.goods_owner_name === "Integriti");
  if (existing) {
    log("goods owner", `exists id=${existing.id}`);
    return existing;
  }
  const id = await api(client, "POST", "/goodsowner", {
    goods_owner_name: "Integriti",
    city: "Remote",
    address: "Integriti Studio",
    manager: "admin",
    contact_tel: "",
    is_valid: true,
  });
  log("goods owner", `created id=${id}`);
  return { id, goods_owner_name: "Integriti" };
}

async function ensureWarehouse(client) {
  const rows = await api(client, "GET", "/warehouse/all");
  if (!rows.length) {
    throw new Error("No warehouse in ModernWMS — create one in the UI first");
  }
  const wh = rows[0];
  log("warehouse", `using id=${wh.id} name=${wh.warehouse_name}`);
  return wh;
}

async function ensureCategory(client) {
  const rows = await api(client, "GET", "/category/all");
  const existing = rows.find((r) => r.category_name === "General") || rows[0];
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
  if (rows.length) {
    const area = rows[0];
    log("warehouse area", `exists id=${area.value || area.id} name=${area.label || area.area_name}`);
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
  if (rows.length) {
    const loc = rows[0];
    log("bin location", `exists id=${loc.value || loc.id} name=${loc.label || loc.location_name}`);
    return { id: Number(loc.value ?? loc.id), location_name: loc.label ?? loc.location_name ?? "A-01-01" };
  }

  const id = await api(client, "POST", "/goodslocation", {
    warehouse_id: warehouse.id,
    warehouse_name: warehouse.warehouse_name,
    warehouse_area_id: area.id,
    warehouse_area_name: area.area_name,
    warehouse_area_property: 0,
    location_name: "A-01-01",
    is_valid: true,
  });
  log("bin location", `created id=${id}`);
  return { id, location_name: "A-01-01" };
}

async function ensureSku(client, category, { barCode, name }) {
  try {
    const sku = await client.getSkuByBarCode(barCode);
    if (sku?.sku_id) {
      log("sku", `${barCode} exists sku_id=${sku.sku_id}`);
      return sku;
    }
  } catch {
    /* create below */
  }

  const spuCode = barCode.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32);
  const spuId = await api(client, "POST", "/spu", {
    spu_code: spuCode,
    spu_name: name,
    category_id: category.id,
    category_name: category.category_name,
    spu_description: `Linker seed SKU ${barCode}`,
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
  log("sku", `${barCode} created spu_id=${spuId} sku_id=${created.sku_id}`);
  return created;
}

async function stockRows(client) {
  return client.stockList({ pageIndex: 1, pageSize: 500 });
}

async function receiveStock(client, { goodsOwner, warehouse, location, skus }) {
  const existing = await stockRows(client);
  const needStock = skus.filter(({ barCode }) => {
    const row = existing.find((r) => String(r.sku_code || r.bar_code || "") === barCode);
    return !row || Number(row.qty || 0) < 10;
  });

  if (!needStock.length) {
    log("stock", "all SKUs already have qty >= 10 — skipping ASN");
    return;
  }

  const detailList = [];
  for (const item of needStock) {
    detailList.push({
      spu_id: item.spu_id,
      spu_code: item.spu_code || item.bar_code,
      spu_name: item.sku_name || item.bar_code,
      sku_id: item.sku_id,
      sku_code: item.bar_code,
      sku_name: item.sku_name || item.bar_code,
      asn_qty: STOCK_QTY,
      actual_qty: 0,
      is_valid: true,
    });
  }

  const masterId = await api(client, "POST", "/asn/asnmaster", {
    asn_batch: `LINKER-${Date.now()}`,
    estimated_arrival_time: nowIso(),
    goods_owner_id: goodsOwner.id,
    goods_owner_name: goodsOwner.goods_owner_name,
    detailList,
  });
  log("asn", `created master id=${masterId}`);

  const master = await api(client, "GET", `/asn/asnmaster?id=${masterId}`);
  const lines = master.detailList || [];
  if (!lines.length) {
    throw new Error("ASN master has no detail lines");
  }

  const ts = nowIso();
  await api(client, "PUT", "/asn/confirm", lines.map((line) => ({ id: line.id, arrival_time: ts })));
  log("asn", "confirmed");

  await api(client, "PUT", "/asn/unload", lines.map((line) => ({
    id: line.id,
    unload_time: ts,
    unload_person: "seed-script",
  })));
  log("asn", "unloaded");

  for (const line of lines) {
    await api(client, "PUT", "/asn/sorting", [{
      asn_id: line.id,
      sorted_qty: line.asn_qty || STOCK_QTY,
      is_auto_num: false,
      series_number: `LINKER-${line.sku_code || line.id}`,
    }]);
  }
  log("asn", "sorted (sorting)");

  await api(client, "PUT", "/asn/sorted", lines.map((line) => line.id));
  log("asn", "sorted (status)");

  for (const line of lines) {
    const pending = await api(client, "GET", `/asn/pending-putaway?id=${line.id}`);
    if (!pending.length) {
      throw new Error(`No pending putaway for asn line ${line.id}`);
    }
    const putawayBatch = pending.map((row) => ({
      asn_id: line.id,
      goods_owner_id: goodsOwner.id,
      goods_location_id: location.id,
      putaway_qty: row.sorted_qty,
      series_number: row.series_number || "",
    }));
    await api(client, "PUT", "/asn/putaway", putawayBatch.slice(0, 1));
  }
  log("asn", `putaway complete (+${STOCK_QTY} each)`);
}

async function configureLinkerWarehouse({ customerId, goodsOwnerId, tenantId }) {
  if (SKIP_LINKER) {
    log("linker", "SKIP_LINKER_CONFIG=1 — skipped");
    return;
  }

  const mongoose = require("mongoose");
  const { connectDb, disconnectDb } = require("../src/db/connect");
  const Warehouse = require("../src/modules/companies/warehouseModel");

  try {
    await connectDb();

    let warehouse = await Warehouse.findById(LINKER_WAREHOUSE_ID);
    if (!warehouse) {
      warehouse = await Warehouse.findOne({});
      if (warehouse) {
        log("linker", `warehouse ${LINKER_WAREHOUSE_ID} not found — using ${warehouse._id} (${warehouse.name})`);
      }
    }
    if (!warehouse) {
      log("linker", "no warehouse documents in Mongo — configure via admin dash");
      return;
    }

    warehouse.fulfillmentMode = "modernwms";
    warehouse.modernwms = warehouse.modernwms || {};
    warehouse.modernwms.baseUrl = BASE_URL;
    warehouse.modernwms.username = USERNAME;
    warehouse.modernwms.passwordEncrypted = encrypt(PASSWORD);
    warehouse.modernwms.tenantId = tenantId;
    warehouse.modernwms.defaultCustomerId = customerId;
    warehouse.modernwms.goodsOwnerId = goodsOwnerId;
    warehouse.modernwms.autoConfirmOrder = false;
    await warehouse.save();

    log("linker", `warehouse ${warehouse._id} set to modernwms (customer=${customerId})`);
  } catch (err) {
    log("linker", `Mongo update failed: ${err.message}`);
    console.log("\n  Configure manually in admin dash:");
    console.log(`    Base URL: ${BASE_URL}`);
    console.log(`    Username: ${USERNAME}`);
    console.log(`    Password: ${PASSWORD}`);
    console.log(`    Tenant ID: ${tenantId}`);
    console.log(`    Default customer ID: ${customerId}`);
    console.log(`    Goods owner ID: ${goodsOwnerId}`);
  } finally {
    await disconnectDb().catch(() => {});
  }
}

async function main() {
  console.log("\n=== ModernWMS live seed ===\n");
  console.log(`Target: ${BASE_URL}`);

  const client = new ModernWmsClient({ baseUrl: BASE_URL, username: USERNAME, password: PASSWORD });
  const conn = await client.testConnection();
  log("login", `tenant_id=${conn.tenantId}`);

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

  await receiveStock(client, { goodsOwner, warehouse, location, skus });

  const stock = await stockRows(client);
  console.log("\nStock summary:");
  for (const def of SEED_SKUS) {
    const row = stock.find((r) => String(r.sku_code || r.bar_code || "") === def.barCode);
    console.log(`  ${def.barCode}: qty=${row?.qty ?? 0} available=${row?.qty_available ?? row?.qty ?? 0}`);
  }

  await configureLinkerWarehouse({
    customerId: customer.id,
    goodsOwnerId: goodsOwner.id,
    tenantId: conn.tenantId,
  });

  console.log("\nDone. Test connection in admin dash, then allocate an order.\n");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.stack || err.message || err);
  process.exit(1);
});
