/**
 * Diagnose why Shopify orders may not appear in the portal.
 *   node scripts/diagnose-shopify-orders.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

async function main() {
  const { connectDb, disconnectDb } = require("../src/db/connect");
  await connectDb();

  const Shop = require("../src/modules/shops/model");
  const Order = require("../src/modules/orders/model");
  const WebhookEvent = require("../src/modules/events/model");
  const Job = require("../src/modules/queue/model");
  const Company = require("../src/modules/companies/model");

  console.log("\n=== Shopify order ingestion diagnostic ===\n");
  console.log(`API: ${process.env.PUBLIC_API_URL || "(unset)"}`);
  console.log(`Webhook URL should be: ${process.env.SHOPIFY_HOST_NAME || process.env.PUBLIC_API_URL}/api/shopify/webhooks\n`);

  const shops = await Shop.find({}).sort({ updatedAt: -1 }).lean();
  console.log(`Shops (${shops.length}):`);
  for (const s of shops) {
    const company = s.companyId ? await Company.findById(s.companyId).select("name email").lean() : null;
    const processable = Boolean(s.enabled && s.installed && s.accessTokenEncrypted);
    console.log(`  - ${s.shopDomain}`);
    console.log(`      company: ${company?.name || "NONE"} (${s.companyId || "unassigned"})`);
    console.log(`      enabled=${s.enabled} installed=${s.installed} hasToken=${Boolean(s.accessTokenEncrypted)} processable=${processable}`);
    if (!processable) {
      const reasons = [];
      if (!s.enabled) reasons.push("shop disabled in platform");
      if (!s.installed) reasons.push("app not installed / OAuth not completed");
      if (!s.accessTokenEncrypted) reasons.push("no access token");
      console.log(`      BLOCKED: ${reasons.join("; ")}`);
    }
  }

  const oneHourAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentEvents = await WebhookEvent.find({ createdAt: { $gte: oneHourAgo } }).sort({ createdAt: -1 }).limit(25).lean();
  console.log(`\nWebhook events (last 24h, ${recentEvents.length} shown):`);
  if (!recentEvents.length) {
    console.log("  NONE — Shopify may not be delivering webhooks to this backend.");
  }
  for (const e of recentEvents) {
    console.log(`  ${e.createdAt?.toISOString()} | ${e.topic} | ${e.shopDomain} | ${e.status}${e.error ? ` (${e.error})` : ""}`);
  }

  const recentOrders = await Order.find({ createdAt: { $gte: oneHourAgo } }).sort({ createdAt: -1 }).limit(15).lean();
  console.log(`\nOrders (last 24h, ${recentOrders.length} shown):`);
  if (!recentOrders.length) console.log("  NONE");
  for (const o of recentOrders) {
    console.log(`  ${o.createdAt?.toISOString()} | ${o.orderNumber} | ${o.status} | source=${o.source}`);
  }

  const stuck = await WebhookEvent.countDocuments({ status: "received" });
  const totalEvents = await WebhookEvent.countDocuments({});
  const totalOrders = await Order.countDocuments({});
  const failedJobs = await Job.find({ status: "failed" }).sort({ updatedAt: -1 }).limit(5).lean();
  console.log(`\nTotals: ${totalEvents} webhook events all-time, ${totalOrders} orders all-time`);
  console.log(`Queue: ${stuck} webhook events stuck in 'received'`);
  if (failedJobs.length) {
    console.log("Failed jobs:");
    for (const j of failedJobs) {
      console.log(`  ${j.topic}: ${j.lastError}`);
    }
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
