const crypto = require("crypto");
const env = require("../../config/env");

function publicHost(request) {
  if (env.shopifyHostName) {
    return env.shopifyHostName;
  }

  const forwarded = request.headers["x-forwarded-host"];
  const host = forwarded || request.headers.host || `127.0.0.1:${env.port}`;
  return String(host).split(",")[0].trim();
}

function publicOrigin(request) {
  const host = publicHost(request);
  const isLocal = host.startsWith("127.0.0.1") || host.startsWith("localhost");
  const proto = request.headers["x-forwarded-proto"] || (isLocal ? "http" : "https");
  return `${String(proto).split(",")[0].trim()}://${host}`;
}

function verifyHmac(rawBody, hmacHeader) {
  if (!env.shopifyApiSecret || !hmacHeader) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", env.shopifyApiSecret)
    .update(rawBody)
    .digest("base64");

  const left = Buffer.from(digest);
  const right = Buffer.from(String(hmacHeader));
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function verifyQueryHmac(query) {
  const { hmac, ...rest } = query || {};
  if (!hmac || !env.shopifyApiSecret) {
    return false;
  }

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(",") : rest[key]}`)
    .join("&");

  const digest = crypto.createHmac("sha256", env.shopifyApiSecret).update(message).digest("hex");
  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(String(hmac), "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function buildAuthorizeUrl({ shop, state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: env.shopifyApiKey,
    scope: env.shopifyScopes.join(","),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

async function exchangeToken({ shop, code }) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.shopifyApiKey,
      client_secret: env.shopifyApiSecret,
      code,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify token exchange failed: ${text}`);
  }

  return response.json();
}

async function graphql(shopDomain, accessToken, query, variables = {}) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/${env.shopifyApiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await response.json();
  if (!response.ok || json.errors) {
    const message = json.errors?.[0]?.message || `Shopify GraphQL ${response.status}`;
    const error = new Error(message);
    error.details = json;
    throw error;
  }
  return json.data;
}

async function registerWebhooks(shopDomain, accessToken, callbackUrl) {
  const topics = ["ORDERS_CREATE", "ORDERS_CANCELLED", "APP_UNINSTALLED"];

  for (const topic of topics) {
    await graphql(
      shopDomain,
      accessToken,
      `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          userErrors { field message }
        }
      }`,
      {
        topic,
        webhookSubscription: {
          callbackUrl,
          format: "JSON",
        },
      }
    );
  }
}

module.exports = {
  publicOrigin,
  verifyHmac,
  verifyQueryHmac,
  buildAuthorizeUrl,
  exchangeToken,
  graphql,
  registerWebhooks,
};
