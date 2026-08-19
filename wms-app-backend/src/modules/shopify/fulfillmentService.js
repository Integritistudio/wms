const { graphql } = require("./client");
const env = require("../../config/env");
const logger = require("../../config/logger");

function isEnabled() {
  return env.fulfillmentServiceEnabled === true;
}

async function register(shopDomain, accessToken, callbackUrl) {
  if (!isEnabled()) {
    logger.debug("FulfillmentService registration skipped (disabled)");
    return null;
  }

  const data = await graphql(
    shopDomain,
    accessToken,
    `mutation fulfillmentServiceCreate($name: String!, $callbackUrl: URL, $trackingSupport: Boolean!, $inventoryManagement: Boolean!) {
      fulfillmentServiceCreate(
        name: $name
        callbackUrl: $callbackUrl
        trackingSupport: $trackingSupport
        inventoryManagement: $inventoryManagement
      ) {
        fulfillmentService {
          id
          serviceName
          location { id name }
        }
        userErrors { field message }
      }
    }`,
    {
      name: "WMS Linker",
      callbackUrl: callbackUrl || null,
      trackingSupport: true,
      inventoryManagement: false,
    }
  );

  const errors = data.fulfillmentServiceCreate?.userErrors || [];
  if (errors.length > 0) {
    logger.warn({ errors, shop: shopDomain }, "FulfillmentService creation errors");
    return { errors };
  }

  const service = data.fulfillmentServiceCreate?.fulfillmentService;
  logger.info({ shop: shopDomain, serviceId: service?.id }, "FulfillmentService registered");
  return service;
}

async function update(shopDomain, accessToken, serviceId, callbackUrl) {
  if (!isEnabled()) return null;

  const data = await graphql(
    shopDomain,
    accessToken,
    `mutation fulfillmentServiceUpdate($id: ID!, $callbackUrl: URL, $trackingSupport: Boolean!) {
      fulfillmentServiceUpdate(
        id: $id
        callbackUrl: $callbackUrl
        trackingSupport: $trackingSupport
      ) {
        fulfillmentService { id serviceName }
        userErrors { field message }
      }
    }`,
    { id: serviceId, callbackUrl, trackingSupport: true }
  );

  return data.fulfillmentServiceUpdate;
}

async function handleNotification(request, reply) {
  const kind = request.headers["x-shopify-fulfillment-order-notification-type"];
  const body = request.body || {};

  logger.info({ kind, fulfillmentOrderId: body.fulfillment_order?.id }, "Fulfillment notification received");

  // Persist for future processing when activated
  const events = require("../events");
  await events.persist({
    webhookId: `fn-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    topic: `fulfillment_notification/${kind || "unknown"}`,
    shopDomain: body.fulfillment_order?.assigned_location?.name || "",
    payload: body,
  });

  return reply.success({ message: "Notification received" });
}

module.exports = {
  isEnabled,
  register,
  update,
  handleNotification,
};
