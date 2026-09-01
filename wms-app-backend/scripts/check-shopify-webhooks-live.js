/**
 * Check Shopify webhook subscriptions + recent orders vs linker DB.
 *   node scripts/check-shopify-webhooks-live.js [shop-domain]
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const domain = process.argv[2] || "wms-store-prdr2ihq.myshopify.com";

async function main() {
  const { connectDb, disconnectDb } = require("../src/db/connect");
  const shops = require("../src/modules/shops");
  const client = require("../src/modules/shopify/client");
  const env = require("../src/config/env");

  await connectDb();
  const shop = await shops.findByDomain(domain);
  if (!shop) {
    console.error(`Shop not found in DB: ${domain}`);
    process.exit(1);
  }

  console.log(`\nShop: ${shop.shopDomain}`);
  console.log(`  processable: ${shops.isProcessable(shop)}`);
  console.log(`  companyId: ${shop.companyId}`);

  if (!shops.isProcessable(shop)) {
    console.error("\nShop is not processable — complete OAuth install first.");
    process.exit(1);
  }

  const token = shops.getAccessToken(shop);
  const expectedWebhook = env.shopifyApiUrl("/shopify/webhooks");
  console.log(`\nExpected webhook URL: ${expectedWebhook}`);

  const hookData = await client.graphql(
    shop.shopDomain,
    token,
    `query {
      webhookSubscriptions(first: 20) {
        edges {
          node {
            id
            topic
            endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } }
          }
        }
      }
    }`
  );

  console.log("\nShopify webhook subscriptions:");
  const subs = hookData.webhookSubscriptions?.edges || [];
  if (!subs.length) console.log("  NONE registered in Shopify");
  for (const { node } of subs) {
    const url = node.endpoint?.callbackUrl || "(no url)";
    console.log(`  ${node.topic} → ${url}`);
  }

  const orderData = await client.graphql(
    shop.shopDomain,
    token,
    `query {
      orders(first: 5, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            displayFulfillmentStatus
          }
        }
      }
    }`
  );

  console.log("\nRecent Shopify orders (store):");
  for (const { node } of orderData.orders?.edges || []) {
    console.log(`  ${node.createdAt} | ${node.name} | fulfillment=${node.displayFulfillmentStatus}`);
  }

  const WebhookEvent = require("../src/modules/events/model");
  const Order = require("../src/modules/orders/model");
  const events = await WebhookEvent.find({ shopDomain: shop.shopDomain }).sort({ createdAt: -1 }).limit(5).lean();
  console.log(`\nLinker webhook_events for shop (${events.length} recent):`);
  if (!events.length) console.log("  NONE ever recorded");
  for (const e of events) {
    console.log(`  ${e.createdAt?.toISOString()} | ${e.topic} | ${e.status} ${e.error || ""}`);
  }

  const dbOrders = await Order.find({ shopId: shop._id }).sort({ createdAt: -1 }).limit(5).lean();
  console.log(`\nLinker orders for shop (${dbOrders.length} recent):`);
  if (!dbOrders.length) console.log("  NONE");
  for (const o of dbOrders) {
    console.log(`  ${o.createdAt?.toISOString()} | ${o.orderNumber} | ${o.status}`);
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  if (err.details) console.error(JSON.stringify(err.details, null, 2));
  process.exit(1);
});
