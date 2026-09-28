// Read-only live diagnostics. Never prints credentials or tokens.
require("dotenv").config({ quiet: true });
process.env.LOG_LEVEL = "silent";
const mongoose = require("mongoose");
const { connectDb, disconnectDb } = require("../src/db/connect");
const shops = require("../src/modules/shops");
const client = require("../src/modules/shopify/client");

async function main() {
  const domain = process.argv[2];
  const sku = process.argv[3] || "IT-01";
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(domain || "")) throw new Error("Provide the exact myshopify.com domain");
  await connectDb();
  const shop = await shops.findByDomain(domain);
  if (!shop) throw new Error("Store not found in the configured database");
  const company = await mongoose.connection.collection("companies").findOne({ _id: shop.companyId }, { projection: { name: 1, email: 1 } });
  const inventory = await mongoose.connection.collection("warehouse_inventory").find({ companyId: shop.companyId, sku }).project({ warehouseId: 1, sku: 1, quantityAvailable: 1, quantityOnHand: 1, reserved: 1 }).toArray();
  console.log(JSON.stringify({ store: shop.toPublic(), company, inventory }, null, 2));
  const token = shops.getAccessToken(shop); // read only: no token renewal or DB writes
  for (const [check, query, variables] of [
    ["grantedScopes", "query { currentAppInstallation { accessScopes { handle } } }", {}],
    ["locations", "query { locations(first: 50) { nodes { id name isActive fulfillsOnlineOrders } } }", {}],
    ["product", "query($id: ID!) { product(id: $id) { id title variants(first: 20) { nodes { id sku inventoryItem { id tracked inventoryLevels(first: 20) { nodes { location { id } quantities(names: [\"available\"]) { name quantity } } } } } } } }", { id: "gid://shopify/Product/10318546993402" }],
  ]) {
    try { console.log(JSON.stringify({ check, result: await client.graphql(domain, token, query, variables) }, null, 2)); }
    catch (error) { console.log(JSON.stringify({ check, error: error.message, code: error.code, status: error.statusCode })); }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(disconnectDb);
