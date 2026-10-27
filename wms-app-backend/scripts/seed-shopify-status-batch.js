// Create/resume the authorized 50-order Shopify QA batch. No secrets in this file.
// Configure MONGODB_*, JWT_SECRET, SHOPIFY_API_KEY and SHOPIFY_API_SECRET in env.
// Use --create to create orders; without it this only verifies permissions/plan.
require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const BATCH = "WMS-QA-20261022-50";
const SCENARIOS = [
  ["received", 4], ["940_ready", 4], ["945_received", 2],
  ["partially_fulfilled", 3], ["fulfilled", 4], ["cancelled", 3],
  ["ignored", 2], ["error", 3], ["on_hold", 3],
  ["picking", 2], ["picked", 2], ["packing", 2], ["packed", 2],
  ...["requested", "authorized", "in_transit", "received", "inspected", "restocked", "refurbished", "damaged", "quarantined", "disposed", "scrapped", "refunded", "exchanged", "cancelled"].map(status => [`return_${status}`, 1]),
];
const plan = SCENARIOS.flatMap(([scenario, count]) => Array.from({ length: count }, () => ({ scenario })));
if (plan.length !== 50) throw new Error("Expected exactly 50 scenarios");
plan.forEach((row, i) => { row.index = i + 1; row.key = `${BATCH}-${String(i + 1).padStart(2, "0")}`; });

async function main() {
  const output = path.resolve(__dirname, "../../outputs/shopify-orders");
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "batch-plan.json"), JSON.stringify({ batch: BATCH, count: 50, orders: plan }, null, 2));
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const shop = await require("../src/modules/shops/model").findOne({ shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  if (!shop) throw new Error("Expected Shopify store not found");
  const graphql = (query, variables) => require("../src/modules/shops/service").shopifyGraphql(shop, query, variables);
  const preflight = await graphql(`{
    currentAppInstallation { accessScopes { handle } }
    shop { plan { partnerDevelopment } }
    products(first: 50) { nodes { variants(first: 10) { nodes { id sku } } } }
  }`);
  if (!preflight.shop.plan.partnerDevelopment) throw new Error("Refusing to seed a store that is not a development store");
  const scopes = new Set(preflight.currentAppInstallation.accessScopes.map(s => s.handle));
  const missing = ["write_orders", "write_returns", "write_fulfillments", "write_merchant_managed_fulfillment_orders"].filter(scope => !scopes.has(scope));
  if (missing.length) throw new Error(`No orders created. Reconnect the Shopify app after granting: ${missing.join(", ")}`);
  if (!process.argv.includes("--create")) { console.log("Permissions verified. Plan ready; pass --create to create/resume the 50 Shopify test orders."); return; }
  const variants = preflight.products.nodes.flatMap(p => p.variants.nodes);
  const skuA = variants.find(v => v.sku === "SKU-A");
  const skuB = variants.find(v => v.sku === "SKU-B");
  if (!skuA || !skuB) throw new Error("SKU-A and SKU-B variants are required");
  // Search before each create: an interrupted batch must not create duplicates.
  const results = [];
  let lastCreatedAt = 0;
  async function createOrder(query, variables) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const delay = Math.max(0, 15000 - (Date.now() - lastCreatedAt));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const result = await graphql(query, variables);
      lastCreatedAt = Date.now();
      const errors = result.orderCreate?.userErrors || [];
      if (!errors.some(error => /too many attempts|rate limit|throttl/i.test(error.message))) return result;
      console.log("Shopify development-store creation limit reached; waiting 30s before retrying the same order");
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    throw new Error("Shopify creation throttle persists; rerun to resume safely");
  }
  const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Limit must be between 1 and 50");
  for (const row of plan.slice(0, limit)) {
    const existing = await graphql("query($query: String!) { orders(first: 2, query: $query) { nodes { id name test tags } } }", { query: `tag:${row.key}` });
    if (existing.orders.nodes.length > 1) throw new Error(`Duplicate Shopify orders for ${row.key}; investigate before continuing`);
    let order = existing.orders.nodes[0];
    if (!order) {
      const created = await createOrder(`mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) { order { id name test tags } userErrors { field message } }
      }`, {
        order: { test: true, name: row.key, currency: "USD", financialStatus: "PAID",
          tags: [BATCH, row.key, "wms-test-order", `scenario-${row.scenario}`],
          sourceIdentifier: row.key, sourceName: "wms_qa_batch",
          note: `Authorized Shopify QA order ${row.index}/50. Intended WMS stage: ${row.scenario}. Test workflow; no real carrier booking.`,
          shippingAddress: { firstName: "QA", lastName: `Customer ${row.index}`, address1: "100 Demo Avenue", city: row.index % 2 ? "New York" : "Newark", provinceCode: row.index % 2 ? "NY" : "NJ", countryCode: "US", zip: row.index % 2 ? "10001" : "07102" },
          lineItems: [{ variantId: skuA.id, quantity: 2 }, { variantId: skuB.id, quantity: 1 }],
        },
        options: { sendReceipt: false, sendFulfillmentReceipt: false, inventoryBehaviour: "BYPASS" },
      });
      const errors = created.orderCreate.userErrors;
      if (errors.length) throw new Error(`${row.key}: ${errors.map(e => e.message).join("; ")}`);
      order = created.orderCreate.order;
    }
    if (!order?.test) throw new Error(`Order ${row.key} is not marked test`);
    results.push({ ...row, shopifyId: order.id, shopifyName: order.name, test: order.test, lifecycleApplied: false });
    await fs.writeFile(path.join(output, "batch-created.json"), JSON.stringify({ batch: BATCH, orders: results }, null, 2));
    console.log(`${results.length}/50 ${order.name}: created/verified in Shopify; lifecycle staging pending`);
  }
}
main().catch(error => { console.error(String(error.message).slice(0, 700)); process.exitCode = 1; }).finally(() => mongoose.disconnect());
