require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const output = path.resolve(__dirname, "../../outputs/shopify-orders");
  const manifest = JSON.parse(await fs.readFile(path.join(output, "batch-created.json"), "utf8"));
  const Shop = require("../src/modules/shops/model");
  const shop = await Shop.findOne({ shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  const query = await fs.readFile(path.join(output, "audit-qa.graphql"), "utf8");
  const data = await require("../src/modules/shops/service").shopifyGraphql(shop, query, { query: "tag:WMS-QA-20261022-50" });
  const orders = await require("../src/modules/orders/model").find({ shopId: shop._id, shopifyOrderId: { $in: manifest.orders.map(e => e.shopifyId.split("/").pop()) } });
  const orderIds = orders.map(o => o._id);
  const groups = await require("../src/modules/fulfillment/groupModel").find({ orderId: { $in: orderIds }, status: { $ne: "cancelled" } }).lean();
  const links = await require("../src/modules/modernwms/model").find({ orderId: { $in: orderIds } }).lean();
  const returns = await require("../src/modules/fulfillment/returnModel").find({ orderId: { $in: orderIds } }).lean();
  const shipments = await require("../src/modules/fulfillment/shipmentModel").find({ orderId: { $in: orderIds } }).lean();
  if (process.argv.includes("--repair-awaiting-sync")) {
    for (const entry of manifest.orders.filter(e => e.scenario === "945_received")) {
      const order = orders.find(o => o.shopifyOrderId === entry.shopifyId.split("/").pop());
      const remote = data.orders.nodes.find(o => o.id === entry.shopifyId);
      const shipped = shipments.filter(s => String(s.orderId) === String(order?._id));
      if (order && remote?.test && remote.displayFulfillmentStatus === "UNFULFILLED" && shipped.length && shipped.every(s => !s.shopifyFulfillmentId)) {
        order.status = "945_received";
        order.routingReason = "QA intermediate stage: ModernWMS shipped and 945 received; awaiting manual Shopify fulfillment sync";
        await order.save();
      }
    }
  }
  const countBy = (rows, key) => rows.reduce((counts, row) => { counts[row[key]] = (counts[row[key]] || 0) + 1; return counts; }, {});
  const warehouse = await require("../src/modules/companies/warehouseModel").findOne({ companyId: shop.companyId, name: "NJ Warehouse" });
  const dispatchRows = await require("../src/modules/modernwms/client").clientFromWarehouse(warehouse).listDispatches({ pageIndex: 1, pageSize: 500 });
  const dispatchMismatches = [];
  for (const link of links) {
    const order = orders.find(o => String(o._id) === String(link.orderId));
    const rows = dispatchRows.filter(row => row.dispatch_no === link.dispatchNo);
    if (rows.length && rows.some(row => !String(row.customer_name || "").trim().endsWith(`#${order.orderNumber}`))) {
      dispatchMismatches.push({ order: order.orderNumber, dispatch: link.dispatchNo });
    }
  }
  const rows = manifest.orders.map(entry => {
    const order = orders.find(o => o.shopifyOrderId === entry.shopifyId.split("/").pop());
    const remote = data.orders.nodes.find(o => o.id === entry.shopifyId);
    const rma = returns.find(r => String(r.orderId) === String(order?._id));
    const orderGroups = groups.filter(g => String(g.orderId) === String(order?._id));
    return { index: entry.index, name: entry.shopifyName, shopifyId: entry.shopifyId, test: remote?.test,
      intendedScenario: entry.index === 1 ? "fulfilled_pilot" : entry.scenario,
      shopifyStatus: remote?.cancelledAt ? "CANCELLED" : remote?.displayFulfillmentStatus,
      linkerStatus: order?.status || "NOT_INGESTED", groupStatuses: orderGroups.map(g => g.status),
      dispatches: links.filter(l => String(l.orderId) === String(order?._id) && !l.closed).map(l => ({ number: l.dispatchNo, stage: l.dispatchStatus })),
      returnStatus: rma?.status || "", shopifyReturnStatus: remote?.returns.nodes.map(r => r.status).join(",") || "",
      returnSyncError: rma?.metadata?.shopifyReturnError || "",
    };
  });
  const summary = { created: manifest.orders.length, shopifyCount: data.orders.nodes.length,
    linkerCount: orders.length, testOrders: data.orders.nodes.filter(o => o.test).length,
    linkerStatuses: countBy(orders, "status"), groupStatuses: countBy(groups, "status"),
    shipmentStatuses: countBy(shipments, "status"), returnStatuses: countBy(returns, "status"),
    shopifyReturns: data.orders.nodes.reduce((n, o) => n + o.returns.nodes.length, 0),
    missingOrders: rows.filter(r => r.linkerStatus === "NOT_INGESTED").map(r => r.index),
    returnErrors: rows.filter(r => r.returnSyncError),
    dispatchMismatches,
  };
  await fs.writeFile(path.join(output, "batch-audit.json"), JSON.stringify({ summary, orders: rows }, null, 2));
  const md = ["# Shopify QA batch", "", `Batch: WMS-QA-20261022-50. Shopify orders: ${summary.shopifyCount}; Linker orders: ${summary.linkerCount}.`, "",
    "All orders are actual Shopify test orders. Hold, skip and validation-error cases are deliberate QA actions. Refund/exchange labels represent return workflow examples; no real customer funds are charged or refunded.", "",
    "| Order | Scenario | Shopify | Linker | Fulfillment groups | Return | Shopify return |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(r => `| [${r.name}](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/${r.shopifyId.split("/").pop()}) | ${r.intendedScenario} | ${r.shopifyStatus} | ${r.linkerStatus} | ${r.groupStatuses.join(", ")} | ${r.returnStatus} | ${r.shopifyReturnStatus} |`), "",
  ].join("\n");
  await fs.writeFile(path.join(output, "batch-summary.md"), md);
  console.log(JSON.stringify(summary, null, 2));
  if (!process.argv.includes("--partial") && (summary.shopifyCount !== 50 || summary.linkerCount !== 50 || summary.testOrders !== 50 || summary.returnErrors.length || dispatchMismatches.length)) throw new Error("Batch verification incomplete; see batch-audit.json");
}
main().catch(error => { console.error(String(error.message).slice(0, 700)); process.exitCode = 1; }).finally(() => mongoose.disconnect());
