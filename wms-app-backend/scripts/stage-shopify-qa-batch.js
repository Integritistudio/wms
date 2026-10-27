require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const { advance } = require("./advance-shopify-qa-dispatch");
const output = path.resolve(__dirname, "../../outputs/shopify-orders");
const reportPath = path.join(output, "staging-results.json");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const Order = require("../src/modules/orders/model");
  const Group = require("../src/modules/fulfillment/groupModel");
  const Link = require("../src/modules/modernwms/model");
  const Warehouse = require("../src/modules/companies/warehouseModel");
  const Shop = require("../src/modules/shops/model");
  const Return = require("../src/modules/fulfillment/returnModel");
  const Shipment = require("../src/modules/fulfillment/shipmentModel");
  const fulfillment = require("../src/modules/fulfillment/service");
  const modern = require("../src/modules/modernwms/service");
  const allocate = require("../src/modules/fulfillment/allocate");
  const returns = require("../src/modules/fulfillment/returns");
  const shopify = require("../src/modules/shopify");
  const shop = await Shop.findOne({ shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  if (!shop) throw new Error("Expected shop not found");
  const graphql = (query, variables) => require("../src/modules/shops/service").shopifyGraphql(shop, query, variables);
  let results = [];
  try { results = JSON.parse(await fs.readFile(reportPath, "utf8")).orders; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const save = () => fs.writeFile(reportPath, JSON.stringify({ batch: "WMS-QA-20261022-50", orders: results }, null, 2));

  async function moveWms(order, target, withShopify = true) {
    const links = await Link.find({ orderId: order._id });
    if (!links.length) throw new Error("No ModernWMS dispatch created by Linker");
    for (const link of links) {
      if (!link.dispatchNo) continue;
      const warehouse = await Warehouse.findById(link.warehouseId);
      const client = require("../src/modules/modernwms/client").clientFromWarehouse(warehouse);
      if (!withShopify && target >= 6) { link.closed = true; await link.save(); }
      await advance(client, link.dispatchNo, target);
      if (withShopify || target < 6) await modern.pollDispatchStatus(link, warehouse);
      else {
        const group = await Group.findById(link.groupId);
        if (group.status !== "shipped") await fulfillment.shipGroup({ groupId: group._id, trackingNumber: `QA-${link.dispatchNo}`, carrier: "QA Test Carrier" });
        link.dispatchStatus = target; link.closedAt = new Date(); await link.save();
      }
    }
    return Order.findById(order._id);
  }
  async function rebuildGroups(order, split = false) {
    await fulfillment.unallocateOrder(order, shop);
    const plan = await allocate.planAllocation(order, shop.companyId, { sharedInventory: true });
    if (!plan.plan.size) throw new Error("QA order has no allocatable stock");
    let groups = [];
    for (const [warehouseId, lines] of plan.plan) {
      const batches = split ? lines.map(line => [line]) : [lines];
      for (const batch of batches) groups.push(...await allocate.createGroupsFromPlan(order, shop, { plan: new Map([[warehouseId, batch]]) }));
    }
    order.lineItems = plan.lines; order.warehouseId = groups[0].warehouseId;
    await order.save();
    return groups;
  }
  async function stage(entry, order) {
    const scenario = entry.index === 1 ? "fulfilled_pilot" : entry.scenario;
    if (scenario === "fulfilled_pilot") return;
    if (scenario === "received") { await fulfillment.unallocateOrder(order, shop); return; }
    if (scenario === "940_ready") return;
    if (scenario === "945_received") { await moveWms(order, 6, false); return; }
    if (["picking", "picked", "packing", "packed"].includes(scenario)) {
      await moveWms(order, { picking: 2, picked: 3, packing: 3, packed: 4 }[scenario]);
      await Group.updateMany({ orderId: order._id, status: { $nin: ["shipped", "cancelled"] } }, { $set: { status: scenario } });
      return;
    }
    if (scenario === "partially_fulfilled") {
      let groups = await Group.find({ orderId: order._id, status: { $ne: "cancelled" } });
      if (groups.length < 2 && !groups.some(g => g.status === "shipped")) groups = await rebuildGroups(order, true);
      for (const group of groups) {
        const warehouse = await Warehouse.findById(group.warehouseId);
        if (!await Link.exists({ groupId: group._id })) await modern.pushOrder({ group, order, shop, warehouse });
      }
      const group = groups[0];
      if (group.status !== "shipped") {
        const link = await Link.findOne({ groupId: group._id });
        const warehouse = await Warehouse.findById(group.warehouseId);
        await advance(require("../src/modules/modernwms/client").clientFromWarehouse(warehouse), link.dispatchNo, 6);
        await modern.pollDispatchStatus(link, warehouse);
      }
      return;
    }
    if (scenario === "cancelled") {
      const response = await graphql(`mutation($orderId: ID!) { orderCancel(orderId: $orderId, notifyCustomer: false, refundMethod: {originalPaymentMethodsRefund: true}, restock: false, reason: OTHER, staffNote: "Authorized QA batch cancellation") { job { id done } orderCancelUserErrors { message } userErrors { message } } }`, { orderId: entry.shopifyId });
      const errors = [...response.orderCancel.orderCancelUserErrors, ...response.orderCancel.userErrors];
      if (errors.length) throw new Error(errors.map(e => e.message).join("; "));
      await fulfillment.cancelOrderFulfillment(order, shop);
      order.status = "cancelled"; await order.save();
      return;
    }
    if (["ignored", "on_hold", "error"].includes(scenario)) {
      if (scenario === "ignored") {
        await fulfillment.unallocateOrder(order, shop);
        order.status = "ignored"; order.routingReason = "Authorized QA manual skip: intentionally excluded from fulfillment";
      } else {
        const groups = await rebuildGroups(order);
        if (scenario === "on_hold") {
          await Group.updateMany({ _id: { $in: groups.map(g => g._id) } }, { $set: { status: "on_hold", "metadata.qaHold": true } });
          order.status = "on_hold"; order.routingReason = "Authorized QA manual hold: awaiting warehouse review";
        } else {
          let failure;
          try {
            await require("../src/modules/modernwms/mapper").buildDispatchLines({ client: {}, group: groups[0], order, warehouse: { modernwms: { defaultCustomerId: 0 } } });
          } catch (error) { failure = error; }
          if (!failure) throw new Error("QA validation error did not occur");
          order.status = "error"; order.lastError = `QA validation failure: ${failure.message}`;
          await require("../src/modules/orders/failedOrderService").create({ orderId: order._id, shopId: shop._id, companyId: shop.companyId, reason: "MODERNWMS_ERROR", errorMessage: order.lastError });
        }
      }
      await order.save();
      await require("../src/modules/logs").logOrderTransition({ orderId: order._id, companyId: shop.companyId, fromState: "940_ready", toState: order.status, message: order.routingReason || order.lastError });
      return;
    }
    order = await moveWms(order, 6);
    if (order.lastError?.includes("Shopify fulfill")) throw new Error(order.lastError);
    const shipment = await Shipment.findOne({ orderId: order._id });
    if (scenario === "fulfilled") {
      const shipmentStatus = ["in_transit", "out_for_delivery", "delivered", "failed"][entry.index % 4];
      if (shipment && shipment.status !== shipmentStatus) await fulfillment.updateShipmentStatus({ shipmentId: shipment._id, companyId: shop.companyId, status: shipmentStatus, note: "Authorized QA shipment milestone", source: "qa_batch" });
      return;
    }
    if (!scenario.startsWith("return_")) throw new Error(`Unsupported scenario ${scenario}`);
    const target = scenario.slice(7);
    const rmaNumber = `RMA-QA50-${entry.index}`;
    let rma = await Return.findOne({ companyId: shop.companyId, rmaNumber });
    if (!rma) {
      const full = ["restocked", "refunded", "exchanged"].includes(target);
      const lines = (full ? order.lineItems : order.lineItems.slice(0, 1)).map(line => ({ orderLineId: line.id, sku: line.sku, title: line.title, quantity: full ? line.quantity : 1 }));
      await returns.createReturn(shop.companyId, { orderId: order._id, shipmentId: shipment?._id, warehouseId: order.warehouseId,
        rmaNumber, lines, reason: `Authorized Shopify QA return scenario: ${target}`, metadata: { qaBatch: "WMS-QA-20261022-50", testOrder: true } });
      rma = await Return.findOne({ companyId: shop.companyId, rmaNumber });
    }
    if (!rma.metadata?.shopifyReturnId) {
      const coverage = await returns.recomputeOrderReturnStatus(order._id);
      const sync = await require("../src/modules/shopify/returns").syncReturnOpened({ shop,
        order: coverage?.order || order, returnDoc: rma, isFullReturn: coverage?.isFullReturn === true });
      if (!sync.ok) throw new Error(`Shopify return open failed: ${sync.error || sync.reason}`);
      rma = await Return.findById(rma._id);
    }
    const stages = ["requested", "authorized", "in_transit", "received", "inspected"];
    const terminal = !stages.includes(target) && target !== "cancelled";
    const pathToTarget = target === "cancelled" ? ["cancelled"] : stages.slice(1, stages.includes(target) ? stages.indexOf(target) + 1 : undefined).concat(terminal ? [target] : []);
    for (const next of pathToTarget) {
      rma = await Return.findById(rma._id);
      if (rma.status === next) continue;
      if (!(returns.TRANSITIONS[rma.status] || []).includes(next)) continue;
      await returns.transitionReturn(shop.companyId, rma._id, { status: next, note: `QA workflow advanced to ${next}` });
    }
    rma = await Return.findById(rma._id);
    if (rma.metadata?.shopifyReturnError) throw new Error(`Shopify return sync: ${rma.metadata.shopifyReturnError}`);
    if (!rma.metadata?.shopifyReturnId) throw new Error("Return not linked to a Shopify return");
  }

  const deadline = Date.now() + 40 * 60000;
  while (Date.now() < deadline) {
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(path.join(output, "batch-created.json"), "utf8")); } catch { await sleep(1000); continue; }
    let progressed = false;
    for (const entry of manifest.orders) {
      if (results.some(r => r.index === entry.index && r.complete)) continue;
      const order = await Order.findOne({ shopId: shop._id, shopifyOrderId: entry.shopifyId.split("/").pop() });
      if (!order) continue;
      const webhook = await mongoose.connection.db.collection("webhook_events").findOne({ topic: "orders/create", shopDomain: shop.shopDomain,
        "payload.id": Number(entry.shopifyId.split("/").pop()) }, { projection: { status: 1 } });
      if (webhook?.status === "received") continue;
      progressed = true;
      try {
        await stage(entry, order);
        const fresh = await Order.findById(order._id);
        const record = { index: entry.index, shopifyId: entry.shopifyId, name: entry.shopifyName, scenario: entry.index === 1 ? "fulfilled_pilot" : entry.scenario,
          linkerOrderId: String(order._id), linkerStatus: fresh.status, complete: true };
        results = results.filter(r => r.index !== entry.index).concat(record).sort((a, b) => a.index - b.index);
        console.log("STAGED", JSON.stringify(record));
      } catch (error) {
        const record = { index: entry.index, name: entry.shopifyName, scenario: entry.scenario, complete: false, error: String(error.message).slice(0, 500) };
        results = results.filter(r => r.index !== entry.index).concat(record).sort((a, b) => a.index - b.index);
        console.error("STAGE_FAILED", JSON.stringify(record));
      }
      await save();
    }
    if (manifest.orders.length === 50 && results.filter(row => row.complete).length === 50) {
      console.log("FINAL_STAGE_COUNTS", JSON.stringify(results.reduce((counts, row) => { const key = row.complete ? row.linkerStatus : "needs_attention"; counts[key] = (counts[key] || 0) + 1; return counts; }, {})));
      return;
    }
    await sleep(progressed ? 1000 : 15000);
  }
  throw new Error("Batch creation/staging deadline reached; rerun to resume");
}
main().catch(error => { console.error(String(error.message).slice(0, 700)); process.exitCode = 1; }).finally(() => mongoose.disconnect());
