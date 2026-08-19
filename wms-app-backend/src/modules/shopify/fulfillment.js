const shops = require("../shops");
const { graphql } = require("./client");

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

  const result = await graphql(
    shop.shopDomain,
    accessToken,
    `mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
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
    throw new Error(errors.map((item) => item.message).join("; "));
  }

  return result.fulfillmentCreate.fulfillment;
}

module.exports = {
  createFulfillment,
};
