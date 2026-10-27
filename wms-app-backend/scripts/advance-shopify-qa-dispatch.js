require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");

async function advance(client, dispatchNo, target) {
  let rows = await client.getDispatchByNo(dispatchNo);
  if (!rows.length) throw new Error("Dispatch not found");
  if (target >= 2 && rows.some(r => r.dispatch_status < 2)) {
    const details = await client.request(`dispatchlist/confirm-check?dispatch_no=${encodeURIComponent(dispatchNo)}`);
    if (details.some(d => d.pick_list.reduce((n, p) => n + p.pick_qty, 0) < d.qty)) throw new Error("Insufficient ModernWMS pick stock");
    await client.confirmOrder(details.map(d => ({ ...d, confirm: true })));
    rows = await client.getDispatchByNo(dispatchNo);
  }
  if (target >= 3 && rows.some(r => r.dispatch_status < 3)) {
    await client.request(`dispatchlist/confirm-pick-dispatchlistno?dispatch_no=${encodeURIComponent(dispatchNo)}`, { method: "PUT" });
    rows = await client.getDispatchByNo(dispatchNo);
  }
  if (target >= 4 && rows.some(r => r.dispatch_status < 4)) {
    await client.request("dispatchlist/package", { method: "POST", body: rows.filter(r => r.dispatch_status < 4).map(r => ({ id: r.id, dispatch_no: dispatchNo, dispatch_status: r.dispatch_status, package_qty: r.picked_qty - (r.package_qty || 0), picked_qty: r.picked_qty })) });
    rows = await client.getDispatchByNo(dispatchNo);
  }
  if (target >= 5 && rows.some(r => r.dispatch_status < 5)) {
    await client.request("dispatchlist/weight", { method: "POST", body: rows.filter(r => r.dispatch_status < 5).map(r => ({ id: r.id, dispatch_no: dispatchNo, dispatch_status: r.dispatch_status, weighing_qty: r.picked_qty - (r.weighing_qty || 0), weighing_weight: 1, picked_qty: r.picked_qty })) });
    rows = await client.getDispatchByNo(dispatchNo);
  }
  if (target >= 6 && rows.some(r => r.dispatch_status < 6)) {
    await client.request("dispatchlist/delivery", { method: "POST", body: rows.filter(r => r.dispatch_status < 6).map(r => ({ id: r.id, dispatch_no: dispatchNo, dispatch_status: r.dispatch_status, picked_qty: r.picked_qty })) });
    rows = await client.getDispatchByNo(dispatchNo);
  }
  return Math.min(...rows.map(r => Number(r.dispatch_status)));
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const manifest = JSON.parse(await fs.readFile(path.resolve(__dirname, "../../outputs/shopify-orders/batch-created.json"), "utf8"));
  const index = Number(process.argv.find(a => a.startsWith("--index="))?.split("=")[1] || 1);
  const target = Number(process.argv.find(a => a.startsWith("--stage="))?.split("=")[1] || 6);
  const entry = manifest.orders.find(o => o.index === index);
  if (!entry) throw new Error("Batch order not found");
  const Order = require("../src/modules/orders/model");
  const Shop = require("../src/modules/shops/model");
  const shop = await Shop.findOne({ shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  const order = await Order.findOne({ shopId: shop._id, shopifyOrderId: entry.shopifyId.split("/").pop() });
  if (!order) throw new Error("Shopify order webhook has not reached Linker yet");
  const Link = require("../src/modules/modernwms/model");
  const links = await Link.find({ orderId: order._id });
  if (!links.length) throw new Error(`No ModernWMS dispatch link; Linker status ${order.status}: ${order.lastError}`);
  const Warehouse = require("../src/modules/companies/warehouseModel");
  for (const link of links) {
    const warehouse = await Warehouse.findById(link.warehouseId);
    const client = require("../src/modules/modernwms/client").clientFromWarehouse(warehouse);
    const state = await advance(client, link.dispatchNo, target);
    console.log("ModernWMS", entry.shopifyName, link.dispatchNo, "stage", state);
    await require("../src/modules/modernwms/service").pollDispatchStatus(link, warehouse);
  }
  const fresh = await Order.findById(order._id);
  const q = require("../src/modules/shops/service").shopifyGraphql;
  const verification = await q(shop, "query($id: ID!) { order(id: $id) { id name test displayFulfillmentStatus fulfillments { id status } } }", { id: entry.shopifyId });
  console.log("ROUND_TRIP", JSON.stringify({ shopify: verification.order, linkerStatus: fresh.status, lastError: fresh.lastError }));
}
if (require.main === module) main().catch(error => { console.error(String(error.message).slice(0, 700)); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { advance };
