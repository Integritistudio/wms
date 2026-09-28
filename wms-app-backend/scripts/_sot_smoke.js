#!/usr/bin/env node
/**
 * Smoke: IT-01 qty/tracked, push SKU, simulate Shopify drift revert + notification.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const API = "https://wms-demo-backend.integritistudio.us";
const EMAIL = "zoya.siddiqui@integriti.io";
const PASS = "hell@404";
const SHOP_DOMAIN = "wms-dev-bcd2dcrd.myshopify.com";
const SKU = "IT-01";

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`${method} ${path}: ${json.message || res.status}`);
  return json.data;
}

(async () => {
  const login = await api("/company/auth/login", { method: "POST", body: { email: EMAIL, password: PASS } });
  const token = login.token;
  const shopsList = await api("/company/shops", { token });
  const shopPub = shopsList.find((s) => s.shopDomain === SHOP_DOMAIN);

  await mongoose.connect(process.env.MONGODB_URI);
  const Shop = require("../src/modules/shops/model");
  const shops = require("../src/modules/shops");
  const ProductLink = require("../src/modules/inventorySync/productLinkModel");
  const inventorySync = require("../src/modules/inventorySync");
  const Notifications = require("../src/modules/notifications/model");
  const storeService = require("../src/modules/inventorySync/storeService");
  const shopifyInventory = require("../src/modules/inventorySync/shopifyInventory");

  const shop = await Shop.findById(shopPub.id);
  console.log("1) shop scopes", shop.scopes);
  console.log("   syncedAt", shop.inventorySyncedAt, "error", shop.inventorySyncError || "(none)");

  const link = await ProductLink.findOne({ shopId: shop._id, sku: new RegExp(`^${SKU}$`, "i") });
  if (!link) throw new Error(`No product link for ${SKU}`);
  console.log("2) product link", {
    sku: link.sku,
    syncEnabled: link.syncEnabled,
    inventoryItemId: link.inventoryItemId,
    variantId: link.variantId,
  });

  const live = await shops.shopifyGraphql(
    shop,
    `query ($id: ID!) {
      inventoryItem(id: $id) {
        id tracked sku
        inventoryLevels(first: 5) {
          nodes {
            location { id name }
            quantities(names: ["available"]) { name quantity }
          }
        }
      }
    }`,
    { id: link.inventoryItemId }
  );
  console.log("3) Shopify inventoryItem", JSON.stringify(live.inventoryItem, null, 2));
  if (!live.inventoryItem?.tracked) throw new Error("IT-01 not tracked");

  const targets = await storeService.targetsForSku(shop, SKU);
  console.log("4) WMS targets", targets);
  const authoritative = targets.find((t) => t.locationGid === shop.inventoryLocationGid)?.quantity ?? targets[0]?.quantity;
  const level = live.inventoryItem.inventoryLevels.nodes.find(
    (n) => n.location.id === shop.inventoryLocationGid
  );
  const shopifyQty = level?.quantities?.find((q) => q.name === "available")?.quantity;
  console.log("5) qty match?", { wms: authoritative, shopify: shopifyQty });
  if (Number(shopifyQty) !== Number(authoritative)) {
    console.warn("WARN qty mismatch — will force push");
  }

  // Force push from WMS
  await inventorySync.schedulePushSku({
    companyId: shop.companyId,
    warehouseId: shop.warehouseIds[0],
    sku: SKU,
  });
  console.log("6) scheduled push for", SKU);

  // Simulate Shopify drift: set wrong qty then reconcile
  const wrong = Math.max(0, Number(authoritative) + 7);
  await shopifyInventory.activateAndSet({
    shop,
    inventoryItemId: link.inventoryItemId,
    locationGid: shop.inventoryLocationGid,
    quantity: wrong,
  });
  console.log("7) drifted Shopify to", wrong);

  const beforeNotes = await Notifications.countDocuments({
    companyId: shop.companyId,
    type: "inventory_reverted",
  });

  const result2 = await inventorySync.reconcileShopifyInventoryEvent(shop, {
    inventory_item_id: link.inventoryItemId,
    location_id: shop.inventoryLocationGid,
    available: wrong,
  });
  console.log("8) reconcile", result2, "notes_before", beforeNotes);

  await new Promise((r) => setTimeout(r, 1500));
  const afterNotes = await Notifications.find({
    companyId: shop.companyId,
    type: "inventory_reverted",
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();
  console.log("9) notifications", afterNotes.map((n) => ({ title: n.title, message: n.message, createdAt: n.createdAt })));

  const after = await shops.shopifyGraphql(
    shop,
    `query ($id: ID!) {
      inventoryItem(id: $id) {
        inventoryLevels(first: 10) {
          nodes {
            location { id }
            quantities(names: ["available"]) { quantity }
          }
        }
      }
    }`,
    { id: link.inventoryItemId }
  );
  const restoredNode = after.inventoryItem?.inventoryLevels?.nodes?.find(
    (n) => n.location.id === shop.inventoryLocationGid
  );
  const restored = restoredNode?.quantities?.[0]?.quantity;
  console.log("10) Shopify qty after reconcile", restored, "expected", authoritative);

  if (Number(restored) !== Number(authoritative)) {
    throw new Error(`Revert failed: shopify=${restored} wms=${authoritative}`);
  }
  console.log("SMOKE_OK");
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
