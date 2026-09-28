#!/usr/bin/env node
/**
 * Reconnect-sync + smoke helpers via company API + Shopify GraphQL.
 */
require("dotenv").config();

const API = process.env.PUBLIC_API_URL || "https://wms-demo-backend.integritistudio.us";
const EMAIL = "zoya.siddiqui@integriti.io";
const PASS = "hell@404";
const SHOP_DOMAIN = "wms-dev-bcd2dcrd.myshopify.com";

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${json.message || JSON.stringify(json)}`);
  }
  return json.data;
}

async function shopifyGql(shopDomain, accessToken, query, variables = {}) {
  const res = await fetch(`https://${shopDomain}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

(async () => {
  const login = await req("/company/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASS },
  });
  const token = login.token;
  console.log("logged in as", login.user?.email || login.email || "ok");

  const shops = await req("/company/shops", { token });
  const shop = shops.find((s) => s.shopDomain === SHOP_DOMAIN);
  if (!shop) throw new Error("shop not found");
  console.log("shop", {
    id: shop.id,
    scopes: shop.scopes,
    warehouses: shop.warehouseIds,
    location: shop.inventoryLocationGid,
    syncError: shop.inventorySyncError,
    pending: shop.inventorySyncPending,
    syncedAt: shop.inventorySyncedAt,
    reconnectUrl: shop.reconnectUrl,
  });

  const locations = await req(`/company/shops/${shop.id}/shopify-locations`, { token });
  console.log(
    "locations",
    locations.map((l) => ({ id: l.id, name: l.name }))
  );
  const locationGid =
    shop.inventoryLocationGid ||
    locations.find((l) => l.fulfillsOnlineOrders)?.id ||
    locations[0]?.id;
  if (!locationGid) throw new Error("no Shopify location");

  const warehouses = await req("/company/warehouses", { token }).catch(() => null);
  // warehouses route may differ
  let warehouseIds = shop.warehouseIds || [];
  if (!warehouseIds.length) {
    const me = await req("/company/me", { token });
    warehouseIds = (me.warehouses || me.company?.warehouses || []).map((w) => w.id || w._id).filter(Boolean);
  }
  console.log("using warehouses", warehouseIds, "location", locationGid);

  const saved = await req(`/company/shops/${shop.id}/warehouses`, {
    method: "PUT",
    token,
    body: { warehouseIds, inventoryLocationGid: locationGid },
  });
  console.log("saved warehouses", {
    ids: saved.warehouseIds,
    location: saved.inventoryLocationGid,
    pending: saved.inventorySyncPending,
  });

  const synced = await req(`/company/shops/${shop.id}/sync-inventory`, {
    method: "POST",
    token,
    body: {},
  });
  console.log("sync queued", { pending: synced.inventorySyncPending, error: synced.inventorySyncError });

  // wait for worker
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const rows = await req("/company/shops", { token });
    const s = rows.find((x) => x.id === shop.id);
    console.log(`poll ${i}`, {
      pending: s.inventorySyncPending,
      error: s.inventorySyncError,
      syncedAt: s.inventorySyncedAt,
    });
    if (!s.inventorySyncPending && !s.inventorySyncError && s.inventorySyncedAt) {
      console.log("SYNC_OK");
      break;
    }
    if (!s.inventorySyncPending && s.inventorySyncError) {
      console.log("SYNC_ERR", s.inventorySyncError);
      break;
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
