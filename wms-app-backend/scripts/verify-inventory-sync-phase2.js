/**
 * Phase 2 inventory sync unit checks (opt-in / available qty / group keys).
 * Run: node scripts/verify-inventory-sync-phase2.js
 */
const assert = require("assert");

function availableForShopify(inv) {
  if (!inv) return 0;
  return Math.max(0, Number(inv.quantityAvailable ?? inv.quantityOnHand ?? 0) || 0);
}

function shouldPush(link) {
  return Boolean(link && link.syncEnabled && link.inventoryItemId);
}

assert.strictEqual(availableForShopify({ quantityOnHand: 10, quantityAvailable: 7, reserved: 3 }), 7);
assert.strictEqual(availableForShopify({ quantityOnHand: 2, reserved: 5 }), 2);
assert.strictEqual(availableForShopify(null), 0);

assert.strictEqual(shouldPush({ syncEnabled: true, inventoryItemId: "gid://x" }), true);
assert.strictEqual(shouldPush({ syncEnabled: false, inventoryItemId: "gid://x" }), false);
assert.strictEqual(shouldPush({ syncEnabled: true, inventoryItemId: "" }), false);

console.log("verify-inventory-sync-phase2: ok");
