const crypto = require("crypto");
const env = require("../../config/env");
const logger = require("../../config/logger");
const shops = require("../shops");
const orders = require("../orders");
const events = require("../events");
const client = require("./client");
const fulfillment = require("./fulfillment");

const oauthStates = new Map();

function rememberState(state, shop) {
  oauthStates.set(state, { shop, createdAt: Date.now() });
}

function consumeState(state) {
  const record = oauthStates.get(state);
  oauthStates.delete(state);
  return record;
}

async function beginAuth(request, reply) {
  const shop = shops.normalizeShopDomain(request.query.shop);
  if (!shop) {
    return reply.error({ message: "Missing shop", statusCode: 400 });
  }

  if (!env.shopifyApiKey || !env.shopifyApiSecret) {
    return reply.error({ message: "Shopify API credentials are not configured", statusCode: 503 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  rememberState(state, shop);
  const redirectUri = `${client.publicOrigin(request)}/shopify/auth/callback`;
  return reply.redirect(client.buildAuthorizeUrl({ shop, state, redirectUri }));
}

async function authCallback(request, reply) {
  const { shop, code, state } = request.query || {};
  const remembered = consumeState(state);
  const domain = shops.normalizeShopDomain(shop);

  if (!remembered || remembered.shop !== domain) {
    return reply.error({ message: "Invalid OAuth state", statusCode: 400 });
  }

  if (!client.verifyQueryHmac(request.query)) {
    return reply.error({ message: "Invalid OAuth HMAC", statusCode: 401 });
  }

  const token = await client.exchangeToken({ shop: domain, code });
  const attached = await shops.attachInstall({
    shopDomain: domain,
    accessToken: token.access_token,
    scopes: token.scope,
  });

  if (attached.attached) {
    try {
      await client.registerWebhooks(
        domain,
        token.access_token,
        `${client.publicOrigin(request)}/shopify/webhooks`
      );
    } catch (error) {
      logger.warn({ err: error, shop: domain }, "Webhook registration failed");
    }

    try {
      const fulfillmentSvc = require("./fulfillmentService");
      const callbackUrl = `${client.publicOrigin(request)}/shopify/fulfillment-notifications`;
      await fulfillmentSvc.register(domain, token.access_token, callbackUrl);
    } catch (error) {
      logger.warn({ err: error, shop: domain }, "FulfillmentService registration failed");
    }
  } else {
    logger.info({ shop: domain }, "OAuth completed for a shop that is not allowlisted");
  }

  return reply.success({
    message: attached.attached ? "Shop connected" : "Install ignored until the domain is allowlisted",
    data: { shop: domain, attached: attached.attached },
  });
}

async function processEvent(event) {
  const topic = event.topic;
  const shopDomain = shops.normalizeShopDomain(event.shopDomain);
  const payload = event.payload || {};

  if (topic === "app/uninstalled") {
    await shops.markUninstalled(shopDomain);
    await events.markProcessed(event);
    return;
  }

  if (topic === "customers/data_request" || topic === "customers/redact" || topic === "shop/redact") {
    await events.markIgnored(event, "privacy webhook acknowledged");
    return;
  }

  const shop = await shops.findByDomain(shopDomain);

  if (topic === "orders/cancelled") {
    if (!shop) {
      await events.markIgnored(event, "shop unknown");
      return;
    }
    await orders.cancelByShopifyId(shop, payload.id);
    await events.markProcessed(event);
    return;
  }

  if (topic === "orders/create") {
    if (!shop || !shops.isProcessable(shop)) {
      await events.markIgnored(event, "shop not processable");
      return;
    }
    await orders.ingestFromWebhook(shop, payload);
    await events.markProcessed(event);
    return;
  }

  await events.markIgnored(event, "topic not handled");
}

async function handleWebhook(request, reply) {
  const rawBody = request.rawBody;
  const hmac = request.headers["x-shopify-hmac-sha256"];
  const topic = request.headers["x-shopify-topic"];
  const shopDomain = shops.normalizeShopDomain(request.headers["x-shopify-shop-domain"]);
  const webhookId = request.headers["x-shopify-webhook-id"] || request.headers["x-shopify-event-id"];

  if (!rawBody || !client.verifyHmac(rawBody, hmac)) {
    return reply.error({ message: "Invalid webhook HMAC", statusCode: 401 });
  }

  let payload = {};
  try {
    payload = typeof request.body === "object" && request.body ? request.body : JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    logger.warn({ err: error, topic }, "Webhook JSON parse failed");
  }

  const stored = await events.persist({
    webhookId,
    topic,
    shopDomain,
    payload,
    rawBody,
  });

  if (stored.duplicate) {
    return reply.success({ message: "Duplicate" });
  }

  const queue = require("../queue");
  const orderId = payload?.id ? String(payload.id) : stored.event._id.toString();
  await queue.enqueue({
    groupId: orderId,
    topic: topic || "unknown",
    eventId: stored.event._id,
  });

  return reply.success({ message: "Accepted" });
}

async function replayEvent(id) {
  const event = await events.getById(id);
  event.status = "received";
  event.error = "";
  await event.save();
  await processEvent(event);
  return event.toPublic();
}

async function fulfillOrder({ shop, order }) {
  return fulfillment.createFulfillment({ shop, order });
}

module.exports = {
  beginAuth,
  authCallback,
  handleWebhook,
  processEvent,
  replayEvent,
  fulfillOrder,
  listEvents: events.listByShopDomain,
};
