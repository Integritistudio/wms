require("dotenv").config();
if (process.env.SEED_DNS_SERVERS) require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const Company = require("../src/modules/companies/model");
  const Warehouse = require("../src/modules/companies/warehouseModel");
  const Shop = require("../src/modules/shops/model");
  const Order = require("../src/modules/orders/model");
  const Group = require("../src/modules/fulfillment/groupModel");
  const Inventory = require("../src/modules/routing/inventoryModel");
  const allocate = require("../src/modules/fulfillment/allocate");
  const company = await Company.findOne({ email: "admin@tricode-demo.example" });
  if (!company) throw new Error("Demo company not found");
  const ny = await Warehouse.findOne({ _id: "6ad8ea3635a23e3b94b65a99", companyId: company._id });
  const nj = await Warehouse.findOne({ _id: "6ad8ea3635a23e3b94b65a9a", companyId: company._id });
  if (!ny || !nj || ny.fulfillmentMode !== "sftp_edi") throw new Error("Expected NY/SFTP and NJ warehouses not found");
  ny.name = "NY Warehouse"; nj.name = "NJ Warehouse";
  await ny.save(); await nj.save();
  const Rule = require("../src/modules/routing/ruleModel");
  await Rule.updateOne({ companyId: company._id, name: "Demo Lahore postal orders" }, { $set: { name: "Demo NJ postal orders" } });
  await Rule.updateOne({ companyId: company._id, name: "Demo bulk orders to Karachi" }, { $set: { name: "Demo bulk orders to NY" } });
  const shop = await Shop.findOne({ companyId: company._id, shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  if (!shop) throw new Error("Demo store not found");
  const names = new Map([[String(ny._id), ny.name], [String(nj._id), nj.name]]);
  const scenarios = [
    { number: "DEMO-SPLIT-NY-NJ-01", customer: "Demo Split One", city: "New York", state: "NY", zip: "10001", items: [["test-1", 2], ["SKU-B", 2]] },
    { number: "DEMO-SPLIT-NY-NJ-02", customer: "Demo Split Two", city: "Newark", state: "NJ", zip: "07102", items: [["test-1", 3], ["RT-SMOKE-1", 1]] },
    { number: "DEMO-PARTIAL-NY-NJ-03", customer: "Demo Partial Stock", city: "Jersey City", state: "NJ", zip: "07302", items: [["test-1", 7], ["SKU-A", 1]] },
  ];
  for (const scenario of scenarios) {
    let order = await Order.findOne({ shopId: shop._id, shopifyOrderId: scenario.number });
    if (!order) {
      const lineItems = scenario.items.map(([sku, quantity], i) => ({ id: `${scenario.number}-${i + 1}`, sku, title: sku, quantity, price: "10.00", allocatedQty: 0, shippedQty: 0, status: "open" }));
      order = await Order.create({
        shopId: shop._id, shopifyOrderId: scenario.number, orderNumber: scenario.number,
        source: "demo", status: "received", customerName: scenario.customer,
        email: "demo@example.com", shippingAddress: { name: scenario.customer, address1: "100 Demo Avenue", city: scenario.city, provinceCode: scenario.state, zip: scenario.zip, countryCode: "US" },
        lineItems, currency: "USD", totals: { total: scenario.items.reduce((n, [, q]) => n + q * 10, 0) },
        tags: "demo,split-example", payload: { tags: "demo,split-example" },
        routingReason: "Demo allocation only; ready for manual review. No outbound shipment sent.",
      });
      try {
        const plan = await allocate.planAllocation(order, company._id, { sharedInventory: true });
        if (plan.plan.size !== 2) throw new Error(`Expected a two-warehouse split; got ${plan.plan.size}`);
        await allocate.createGroupsFromPlan(order, shop, plan);
        order.lineItems = plan.lines.map(line => ({ ...line, backorderedQty: Math.max(0, line.quantity - line.allocatedQty) }));
        order.warehouseId = nj._id;
        order.routingReason = `${scenario.number.includes("PARTIAL") ? "Partial allocation with backorder" : "Split allocation"}: NY + NJ. Demo only; no WMS/SFTP dispatch sent.`;
        await order.save();
      } catch (error) {
        const groups = await Group.find({ orderId: order._id });
        if (groups.length) await allocate.releaseGroups(groups);
        await Group.deleteMany({ orderId: order._id });
        await Order.deleteOne({ _id: order._id });
        throw error;
      }
    }
    const groups = await Group.find({ orderId: order._id, status: { $ne: "cancelled" } });
    console.log(JSON.stringify({ order: order.orderNumber, id: order._id,
      groups: groups.map(group => ({ warehouse: names.get(String(group.warehouseId)), lines: group.lines.map(line => ({ sku: line.sku, quantity: line.allocatedQty })) })),
      backorders: order.lineItems.filter(line => line.backorderedQty > 0).map(line => ({ sku: line.sku, quantity: line.backorderedQty })),
    }));
  }
  const stock = await Inventory.findOne({ warehouseId: ny._id, sku: "test-1" }).lean();
  console.log("NY test-1", JSON.stringify({ onHand: stock.quantityOnHand, reserved: stock.reserved, available: stock.quantityAvailable }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
