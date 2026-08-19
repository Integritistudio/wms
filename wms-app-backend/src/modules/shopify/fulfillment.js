const crypto = require("crypto");
const shops = require("../shops");
const { graphql } = require("./client");
const logs = require("../logs");

function getIdempotencyKey(order) {
  if (order.fulfillmentIdempotencyKey) return order.fulfillmentIdempotencyKey;
  const key = crypto.randomUUID();
  order.fulfillmentIdempotencyKey = key;
  return key;
}

async function createFulfillment({ shop, order }) {
  const accessToken = shops.getAccessToken(shop);
  const orderGid = order.shopifyOrderId.startsWith("gid://")
    ? order.shopifyOrderId
    : `gid://shopify/Order/${order.shopifyOrderId}`;

  const data = await graphql(
    shop.shopDomain,
    accessToken,
    `query fulfillmentOrders($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) {
          nodes {
            id
            status
            lineItems(first: 50) {
              nodes { id remainingQuantity }
            }
          }
        }
      }
    }`,
    { id: orderGid }
  );

  const fulfillmentOrders = (data.order?.fulfillmentOrders?.nodes || []).filter(
    (item) => item.status === "OPEN" || item.status === "IN_PROGRESS"
  );

  const lineItemsByFulfillmentOrder = fulfillmentOrders
    .map((item) => ({
      fulfillmentOrderId: item.id,
      fulfillmentOrderLineItems: (item.lineItems?.nodes || [])
        .filter((line) => line.remainingQuantity > 0)
        .map((line) => ({ id: line.id, quantity: line.remainingQuantity })),
    }))
    .filter((item) => item.fulfillmentOrderLineItems.length > 0);

  if (lineItemsByFulfillmentOrder.length === 0) {
    throw new Error("No open fulfillment orders on Shopify");
  }

  const trackingInfo = order.trackingNumber
    ? {
        number: order.trackingNumber,
        company: order.carrier || undefined,
      }
    : undefined;

  const idempotencyKey = getIdempotencyKey(order);
  if (order.save) await order.save();

  const result = await graphql(
    shop.shopDomain,
    accessToken,
    `mutation fulfillmentCreate($fulfillment: FulfillmentInput!) @idempotent(key: "${idempotencyKey}") {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment { id status }
        userErrors { field message }
      }
    }`,
    {
      fulfillment: {
        notifyCustomer: true,
        trackingInfo,
        lineItemsByFulfillmentOrder,
      },
    }
  );

  const errors = result.fulfillmentCreate?.userErrors || [];
  if (errors.length > 0) {
    const errMsg = errors.map((item) => item.message).join("; ");
    logs.logShopifyApi({ orderId: order._id, companyId: shop.companyId, mutation: "fulfillmentCreate", status: "error", userErrors: errors }).catch(() => {});
    try {
      const dlq = require("../orders/failedOrderService");
      await dlq.create({
        orderId: order._id,
        shopId: shop._id,
        companyId: shop.companyId,
        reason: "SHOPIFY_ERROR",
        errorMessage: errMsg,
      });
    } catch { /* best effort */ }
    throw new Error(errMsg);
  }

  logs.logShopifyApi({ orderId: order._id, companyId: shop.companyId, mutation: "fulfillmentCreate", status: "success" }).catch(() => {});
  return result.fulfillmentCreate.fulfillment;
}

module.exports = {
  createFulfillment,
};
