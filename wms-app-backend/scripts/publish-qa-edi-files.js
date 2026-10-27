// Publish only local EDI files already linked to the authorized 50-order batch.
require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs/promises");
async function main() {
  const env = require("../src/config/env");
  if (!env.r2Configured) throw new Error("Shared R2 storage must be configured");
  const manifest = JSON.parse(await fs.readFile(path.resolve(__dirname, "../../outputs/shopify-orders/batch-created.json"), "utf8"));
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const shop = await require("../src/modules/shops/model").findOne({ shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  const orders = await require("../src/modules/orders/model").find({ shopId: shop._id, shopifyOrderId: { $in: manifest.orders.map(e => e.shopifyId.split("/").pop()) } }).select("_id");
  const files = await require("../src/modules/files/model").find({ orderId: { $in: orders.map(o => o._id) } });
  const root = path.resolve(env.fileStorageDir);
  let uploaded = 0;
  for (const file of files) {
    const resolved = path.resolve(root, file.storageKey);
    if (!resolved.startsWith(root + path.sep) || !resolved.endsWith(".edi")) throw new Error("Unsafe QA EDI storage key");
    let body;
    try { body = await fs.readFile(resolved); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    await require("../src/modules/files/storage").putObject(file.storageKey, body, file.contentType);
    uploaded++;
  }
  console.log("Published QA batch EDI files to shared storage:", uploaded);
}
main().catch(error => { console.error(String(error.message).slice(0, 500)); process.exitCode = 1; }).finally(() => mongoose.disconnect());
