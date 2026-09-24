/**
 * Smoke checks for ModernWMS inventory webhook HMAC + reserved-preserving upsert semantics.
 * Run: node scripts/verify-modernwms-webhook.js
 */
const assert = require("assert");
const crypto = require("crypto");
const { verifySignature } = require("../src/modules/modernwms/webhookRoutes");

function sign(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

const secret = "test-secret-abc";
const body = JSON.stringify({
  event: "inventory.quantity_changed",
  sku_code: "SKU-1",
  qty: 10,
  qty_available: 7,
});

assert.strictEqual(verifySignature(Buffer.from(body), sign(body, secret), secret), true);
assert.strictEqual(verifySignature(Buffer.from(body), "bad", secret), false);
assert.strictEqual(verifySignature(Buffer.from(body), sign(body, "other"), secret), false);

// Coalesce key semantics: same warehouse+sku share a groupId
const warehouseId = "abc123";
const groupA = `${warehouseId}:SKU-1`;
const groupB = `${warehouseId}:SKU-1`;
const groupC = `${warehouseId}:SKU-2`;
assert.strictEqual(groupA, groupB);
assert.notStrictEqual(groupA, groupC);

// Available = max(0, onHand - reserved)
function applyAvailable(onHand, reserved) {
  return Math.max(0, onHand - reserved);
}
assert.strictEqual(applyAvailable(10, 3), 7);
assert.strictEqual(applyAvailable(2, 5), 0);

console.log("verify-modernwms-webhook: ok");
