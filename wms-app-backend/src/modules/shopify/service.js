const crypto = require("crypto");
const env = require("../../config/env");
const logger = require("../../config/logger");
const shops = require("../shops");
const orders = require("../orders");
const events = require("../events");
const client = require("./client");
const fulfillment = require("./fulfillment");

const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

function stateSecret() {
  return env.shopifyApiSecret || env.jwtSecret;
}

function signOauthState(shop) {
  const payload = Buffer.from(JSON.stringify({ s: shop, t: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function readOauthState(state, expectedShop) {
  const raw = String(state || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.s || data.s !== expectedShop) return null;
    if (Date.now() - Number(data.t) > OAUTH_STATE_MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function sessionTokenFromRequest(request) {
  const queryToken = request.query?.id_token;
  if (queryToken) return String(queryToken);
  const header = String(request.headers.authorization || "");
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

async function persistInstall(domain, token) {
  const attached = await shops.attachInstall({
    shopDomain: domain,
    accessToken: token.access_token,
    scopes: token.scope,
    expiresIn: token.expires_in,
    refreshToken: token.refresh_token,
    refreshTokenExpiresIn: token.refresh_token_expires_in,
  });

  if (attached.attached) {
    try {
      await client.registerWebhooks(
        domain,
        token.access_token,
        env.shopifyApiUrl("/shopify/webhooks")
      );
    } catch (error) {
      logger.warn({ err: error, shop: domain }, "Webhook registration failed");
    }

    try {
      const fulfillmentSvc = require("./fulfillmentService");
      const callbackUrl = env.shopifyApiUrl("/shopify/fulfillment-notifications");
      await fulfillmentSvc.register(domain, token.access_token, callbackUrl);
    } catch (error) {
      logger.warn({ err: error, shop: domain }, "FulfillmentService registration failed");
    }
  } else {
    logger.info({ shop: domain }, "OAuth completed for a shop that is not allowlisted");
  }

  return attached;
}

async function trySessionTokenInstall(request) {
  const shop = shops.normalizeShopDomain(request.query?.shop);
  const sessionToken = sessionTokenFromRequest(request);
  if (!shop || !sessionToken) {
    return null;
  }

  if (request.query?.id_token && request.query?.hmac && !client.verifyQueryHmac(request.query)) {
    return null;
  }

  const token = await client.exchangeSessionToken({ shop, sessionToken });
  if (!token?.access_token) {
    return null;
  }
  return persistInstall(shop, token);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function connectedPage({ shop, attached }) {
  const safeShop = escapeHtml(shop);
  const title = attached ? "Connected to WMS Linker" : "Shop is not allowlisted";
  const body = attached
    ? `Store <strong>${safeShop}</strong> is connected. You can close this tab and use <strong>Push to Shopify</strong> again.`
    : `OAuth succeeded for <strong>${safeShop}</strong>, but this domain is not allowlisted in the platform console yet.`;
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body style="font-family:sans-serif;padding:2rem;max-width:40rem">
    <h1>${title}</h1>
    <p>${body}</p>
  </body>
</html>`;
}

async function beginAuth(request, reply) {
  const shop = shops.normalizeShopDomain(request.query.shop);
  if (!shop) {
    return reply.error({ message: "Missing shop", statusCode: 400 });
  }

  if (!env.shopifyApiKey || !env.shopifyApiSecret) {
    return reply.error({ message: "Shopify API credentials are not configured", statusCode: 503 });
  }

  try {
    const exchanged = await trySessionTokenInstall(request);
    if (exchanged) {
      return reply.type("text/html").send(connectedPage({ shop, attached: exchanged.attached }));
    }
  } catch (error) {
    logger.warn({ err: error, shop }, "Session token exchange failed; falling back to OAuth");
  }

  const state = signOauthState(shop);
  const redirectUri = env.shopifyApiUrl("/shopify/auth/callback");
  return reply.redirect(client.buildAuthorizeUrl({ shop, state, redirectUri }));
}

async function authCallback(request, reply) {
  const { shop, code, state } = request.query || {};
  const domain = shops.normalizeShopDomain(shop);

  if (!readOauthState(state, domain)) {
    return reply.error({ message: "Invalid OAuth state", statusCode: 400 });
  }

  if (!client.verifyQueryHmac(request.query)) {
    return reply.error({ message: "Invalid OAuth HMAC", statusCode: 401 });
  }

  const token = await client.exchangeToken({ shop: domain, code });
  const attached = await persistInstall(domain, token);

  return reply.type("text/html").send(connectedPage({ shop: domain, attached: attached.attached }));
}

function bootstrapPage(shop) {
  const safeShop = escapeHtml(shop);
  const apiKey = escapeHtml(env.shopifyApiKey || "");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="shopify-api-key" content="${apiKey}">
    <title>WMS Linker</title>
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  </head>
  <body style="font-family:sans-serif;padding:2rem;max-width:40rem">
    <h1>WMS Linker</h1>
    <p id="status">Connecting ${safeShop}…</p>
    <p style="color:#555;font-size:14px">Order webhooks can work without this step. Push to Shopify needs an Admin API token, which is stored when this page loads inside Shopify Admin.</p>
    <script>
      (async function () {
        var status = document.getElementById("status");
        var shop = ${JSON.stringify(shop)};
        try {
          if (!window.shopify || typeof window.shopify.idToken !== "function") {
            status.textContent = "Open WMS Linker from Shopify Admin → Apps, not a separate browser tab. Then try Push to Shopify again.";
            return;
          }
          var idToken = await window.shopify.idToken();
          var res = await fetch("/api/shopify/token-exchange", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + idToken
            },
            body: JSON.stringify({ shop: shop })
          });
          var json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.message || "Token exchange failed");
          }
          if (!json.data || !json.data.attached) {
            status.innerHTML = "Shopify authorized " + shop + ", but this domain is not allowlisted in the platform console.";
            return;
          }
          status.textContent = "Connected. You can close this view and use Push to Shopify again.";
        } catch (err) {
          status.textContent = (err && err.message) ? err.message : String(err);
        }
      })();
    </script>
  </body>
</html>`;
}

async function handleAppLoad(request, reply) {
  const shop = shops.normalizeShopDomain(request.query.shop);
  if (!shop) {
    return reply
      .type("text/html")
      .send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>WMS Linker</title></head>
  <body style="font-family:sans-serif;padding:2rem">
    <h1>Connected to WMS Linker</h1>
    <p>Open this app from Shopify Admin so WMS Linker can store an Admin API token for Push to Shopify.</p>
  </body>
</html>`);
  }

  reply.header(
    "Content-Security-Policy",
    `frame-ancestors https://${shop} https://admin.shopify.com;`
  );
  return reply.type("text/html").send(bootstrapPage(shop));
}

async function handleTokenExchange(request, reply) {
  const shop = shops.normalizeShopDomain(request.body?.shop || request.query?.shop);
  const sessionToken =
    sessionTokenFromRequest(request) || request.body?.sessionToken || request.body?.id_token;
  if (!shop || !sessionToken) {
    return reply.error({ message: "Missing shop or session token", statusCode: 400 });
  }

  try {
    const token = await client.exchangeSessionToken({ shop, sessionToken });
    if (!token?.access_token) {
      return reply.error({ message: "Shopify did not return an access token", statusCode: 401 });
    }
    const attached = await persistInstall(shop, token);
    logger.info(
      { shop, attached: attached.attached, expiring: Boolean(token.expires_in) },
      "Shopify offline token stored"
    );
    return reply.success({
      message: attached.attached ? "Shop connected" : "Install ignored until the domain is allowlisted",
      data: { shop, attached: attached.attached },
    });
  } catch (error) {
    logger.warn({ err: error, shop }, "Token exchange failed");
    return reply.error({
      message: error.message || "Token exchange failed",
      statusCode: 401,
    });
  }
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

  const platform = require("../platform");
  const webhooksOn = await platform.areWebhooksEnabled();
  const lifecycle =
    topic === "app/uninstalled" ||
    topic === "customers/data_request" ||
    topic === "customers/redact" ||
    topic === "shop/redact";
  if (!webhooksOn && !lifecycle) {
    await events.markIgnored(stored.event, "webhooks paused (kill switch)");
    logger.warn({ topic, shopDomain, webhookId }, "Webhook accepted but not queued — WEBHOOKS_ENABLED off");
    return reply.success({ message: "Accepted (processing paused)" });
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

async function fulfillOrder({ shop, order, lines, trackingNumber, carrier, idempotencyKey }) {
  return fulfillment.createFulfillment({ shop, order, lines, trackingNumber, carrier, idempotencyKey });
}

async function markOrderInProgress({ shop, order, message }) {
  return fulfillment.markOrderInProgress({ shop, order, message });
}

module.exports = {
  beginAuth,
  authCallback,
  handleAppLoad,
  handleTokenExchange,
  handleWebhook,
  processEvent,
  replayEvent,
  fulfillOrder,
  markOrderInProgress,
  listEvents: events.listByShopDomain,
};
