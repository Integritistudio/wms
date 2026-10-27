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
  const Shipment = require("../src/modules/fulfillment/shipmentModel");
  const Return = require("../src/modules/fulfillment/returnModel");
  const company = await Company.findOne({ email: "admin@tricode-demo.example" });
  if (!company) throw new Error("Demo company not found");
  const shop = await Shop.findOne({ companyId: company._id, shopDomain: "wms-dev-bcd2dcrd.myshopify.com" });
  const warehouses = await Warehouse.find({ companyId: company._id, name: { $in: ["NY Warehouse", "NJ Warehouse"] } });
  const ny = warehouses.find(w => w.name === "NY Warehouse");
  const nj = warehouses.find(w => w.name === "NJ Warehouse");
  if (!shop || !ny || !nj) throw new Error("Demo store and NY/NJ warehouses required");
  // Historical demo fixtures only: no inventory ledger changes, carrier booking,
  // Shopify return/refund calls, ModernWMS stock receipts, or outbound jobs.
  const metadata = { demo: true, syntheticHistory: true, inventoryLedgerApplied: false,
    note: "Historical demo fixture; quantities and tracking are simulated." };
  const scenarios = [
    { key: "DELIVERED", status: "fulfilled", shipment: "delivered", warehouse: nj, qty: 2 },
    { key: "IN-TRANSIT", status: "fulfilled", shipment: "in_transit", warehouse: ny, qty: 3 },
    { key: "RETURN-REQUESTED", status: "partially_returned", shipment: "delivered", warehouse: ny, qty: 3, returnQty: 1, stages: ["requested"], reason: "Wrong size — awaiting authorization" },
    { key: "RETURN-RECEIVED", status: "partially_returned", shipment: "delivered", warehouse: nj, qty: 3, returnQty: 1, stages: ["requested", "authorized", "in_transit", "received"], reason: "Customer changed mind — awaiting inspection" },
    { key: "RETURN-COMPLETE", status: "returned", shipment: "delivered", warehouse: ny, qty: 2, returnQty: 2, stages: ["requested", "authorized", "in_transit", "received", "inspected", "restocked"], disposition: "restock", reason: "Unopened items — full return completed (demo)" },
    { key: "RETURN-DAMAGED", status: "partially_returned", shipment: "delivered", warehouse: nj, qty: 4, returnQty: 1, stages: ["requested", "authorized", "in_transit", "received", "inspected", "damaged"], disposition: "damaged", reason: "One item arrived damaged — excluded from sellable stock" },
  ];
  const base = Date.now();
  const at = offset => new Date(base - (48 - offset) * 3600000);
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const number = `DEMO-FLOW-${scenario.key}`;
    let order = await Order.findOne({ shopId: shop._id, shopifyOrderId: number });
    if (!order) {
      const sku = `DEMO-HISTORY-${i + 1}`;
      const line = { id: `${number}-1`, sku, title: `Demo ${scenario.key.toLowerCase().replaceAll("-", " ")} item`,
        quantity: scenario.qty, allocatedQty: scenario.qty, shippedQty: scenario.qty, backorderedQty: 0,
        price: "25.00", status: "shipped", wmsUom: "EA" };
      order = await Order.create({ shopId: shop._id, shopifyOrderId: number, orderNumber: number,
        source: "demo", channel: "demo", warehouseId: scenario.warehouse._id, status: scenario.status,
        customerName: `Demo Customer ${i + 1}`, email: `demo-flow-${i + 1}@example.com`,
        shippingAddress: { name: `Demo Customer ${i + 1}`, address1: "100 Demo Avenue", city: scenario.warehouse === ny ? "New York" : "Newark", provinceCode: scenario.warehouse === ny ? "NY" : "NJ", zip: scenario.warehouse === ny ? "10001" : "07102", countryCode: "US" },
        lineItems: [line], currency: "USD", totals: { total: scenario.qty * 25 },
        tags: "demo,historical-fixture,return-flow", payload: { demo: metadata, tags: "demo,historical-fixture,return-flow" },
        routingReason: "Historical demo lifecycle. Tracking, shipment and return events are simulated.",
        trackingNumber: `DEMO-TRACK-${i + 1}`, carrier: "Demo Carrier", sftpStatus: "skipped",
        createdAt: at(0),
      });
    }
    const line = order.lineItems[0];
    let group = await Group.findOne({ orderId: order._id, "metadata.demoFlow": scenario.key });
    if (!group) group = await Group.create({ orderId: order._id, companyId: company._id, shopId: shop._id,
      warehouseId: scenario.warehouse._id, status: "shipped", sftpStatus: "skipped",
      lines: [{ orderLineId: line.id, sku: line.sku, title: line.title, quantity: scenario.qty, allocatedQty: scenario.qty }],
      metadata: { ...metadata, demoFlow: scenario.key }, createdAt: at(1),
    });
    let shipment = await Shipment.findOne({ fulfillmentGroupId: group._id });
    if (!shipment) {
      const stages = scenario.shipment === "delivered" ? ["pending", "labeled", "in_transit", "out_for_delivery", "delivered"] : ["pending", "labeled", "in_transit"];
      shipment = await Shipment.create({ orderId: order._id, fulfillmentGroupId: group._id, companyId: company._id,
        warehouseId: scenario.warehouse._id, status: scenario.shipment, carrier: "Demo Carrier", trackingNumber: order.trackingNumber,
        packages: [{ weight: 1, items: [{ sku: line.sku, quantity: scenario.qty }] }], metadata,
        statusHistory: stages.map((status, idx) => ({ status, note: "Simulated demo shipment event", source: "demo", at: at(idx + 2) })), createdAt: at(2),
      });
    }
    if (String(group.shipmentId) !== String(shipment._id)) { group.shipmentId = shipment._id; await group.save(); }
    if (scenario.stages) {
      const rmaNumber = `RMA-DEMO-${scenario.key}`;
      const status = scenario.stages.at(-1);
      const received = scenario.stages.includes("received");
      await Return.findOneAndUpdate({ companyId: company._id, rmaNumber }, { $setOnInsert: {
        orderId: order._id, companyId: company._id, shopId: shop._id, shipmentId: shipment._id,
        warehouseId: scenario.warehouse._id, rmaNumber, source: "manual", status, reason: scenario.reason,
        disposition: scenario.disposition || "", carrier: "Demo Carrier", trackingNumber: `DEMO-RETURN-${i + 1}`,
        lines: [{ orderLineId: line.id, sku: line.sku, title: line.title, quantity: scenario.returnQty,
          receivedQty: received ? scenario.returnQty : 0, restockedQty: status === "restocked" ? scenario.returnQty : 0,
          disposition: scenario.disposition || "" }],
        statusHistory: scenario.stages.map((stage, idx) => ({ status: stage, note: "Simulated historical demo return event", at: at(idx + 12) })),
        receivedAt: received ? at(15) : null, restockedAt: status === "restocked" ? at(17) : null,
        metadata: { ...metadata, demoFlow: scenario.key }, createdAt: at(12),
      } }, { upsert: true, runValidators: true, returnDocument: "after" });
    }
    console.log(JSON.stringify({ order: number, status: order.status, warehouse: scenario.warehouse.name,
      shipment: shipment.status, return: scenario.stages?.at(-1) || "none", returnQty: scenario.returnQty || 0 }));
  }
  const fixtureOrders = await Order.find({ shopId: shop._id, shopifyOrderId: { $in: scenarios.map(s => `DEMO-FLOW-${s.key}`) } }).lean();
  const ids = fixtureOrders.map(o => o._id);
  const groups = await Group.find({ orderId: { $in: ids } }).lean();
  const shipments = await Shipment.find({ orderId: { $in: ids } }).lean();
  const returns = await Return.find({ orderId: { $in: ids } }).lean();
  if (fixtureOrders.length !== 6 || groups.length !== 6 || shipments.length !== 6 || returns.length !== 4) throw new Error("Fixture verification failed");
  for (const rma of returns) {
    if (!shipments.some(s => String(s._id) === String(rma.shipmentId))) throw new Error("Missing return shipment link");
    for (const line of rma.lines) if (line.restockedQty > line.receivedQty || line.receivedQty > line.quantity) throw new Error("Invalid return quantities");
  }
  console.log("Verified: 6 demo orders, 6 linked shipments, 4 returns with status histories and valid quantities.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
