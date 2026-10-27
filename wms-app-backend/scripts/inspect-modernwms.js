require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  for (const name of ["warehouses", "shops", "orders", "fulfillment_groups"]) {
    const rows = await db.collection(name).find({}).limit(8).toArray();
    console.log(name, JSON.stringify(rows.map(r => {
      if (name === "warehouses") return { id: r._id, name: r.name, company: r.companyId, mode: r.fulfillmentMode, url: r.modernwms?.baseUrl, username: r.modernwms?.username, passwordSet: !!r.modernwms?.passwordEncrypted, customer: r.modernwms?.defaultCustomerId };
      if (name === "shops") return { id: r._id, domain: r.shopDomain, installed: r.installed, tokenSet: !!r.accessTokenEncrypted, scopes: r.scopes };
      if (name === "orders") return { id: r._id, number: r.orderNumber, lines: r.lineItems?.map(l => ({ id: l.id, sku: l.sku, title: l.title, variant: l.variantId })), rawLines: r.payload?.line_items?.map(l => ({ id: l.id, sku: l.sku, variant: l.variant_id })) };
      return { id: r._id, order: r.orderId, lines: r.lines, status: r.status };
    })));
  }
  const { ModernWmsClient } = require("../src/modules/modernwms/client");
  const client = new ModernWmsClient({ baseUrl: process.env.MODERNWMS_DEFAULT_BASE_URL, username: process.env.MODERNWMS_USERNAME, password: process.env.MODERNWMS_PASSWORD });
  console.log("modernConnection", await client.testConnection());
  const stock = await client.stockList();
  console.log("stockSample", JSON.stringify(stock.slice(0, 4)));
  console.log("stockCount", stock.length);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
