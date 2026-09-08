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
  const rest = { ...(query || {}) };
  delete rest.hmac;
  delete rest.signature;
  const hmac = query?.hmac;
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

function extractGraphqlError(json) {
  const errors = json?.errors;
  if (typeof errors === "string" && errors.trim()) {
    return errors.trim();
  }
  if (Array.isArray(errors) && errors.length) {
    const first = errors[0];
    if (typeof first === "string") return first;
    if (first?.message) return first.message;
  }
  return "";
}

function unauthorizedMessage(shopDomain, detail) {
  const shop = shopDomain || "this shop";
  const suffix = `Open WMS Linker in Shopify Admin for ${shop} to reconnect, then try Push to Shopify again.`;
  if (detail) {
    return `${detail} ${suffix}`;
  }
  return `Shopify rejected the store access token (401). ${suffix}`;
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

async function postAccessToken(shop, body) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify token exchange failed: ${text}`);
  }

  return response.json();
}

async function exchangeToken({ shop, code }) {
  return postAccessToken(shop, {
    client_id: env.shopifyApiKey,
    client_secret: env.shopifyApiSecret,
    code,
    expiring: "1",
  });
}

async function exchangeSessionToken({ shop, sessionToken }) {
  return postAccessToken(shop, {
    client_id: env.shopifyApiKey,
    client_secret: env.shopifyApiSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: sessionToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    expiring: "1",
  });
}

async function refreshOfflineToken({ shop, refreshToken }) {
  return postAccessToken(shop, {
    client_id: env.shopifyApiKey,
    client_secret: env.shopifyApiSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function graphql(shopDomain, accessToken, query, variables = {}) {
  if (!accessToken) {
    const error = new Error(unauthorizedMessage(shopDomain, "Shopify access token is missing."));
    error.statusCode = 401;
    error.code = "SHOPIFY_UNAUTHORIZED";
    throw error;
  }

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

  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { errors: text.slice(0, 300) };
  }

  if (!response.ok || json.errors) {
    const extracted = extractGraphqlError(json);
    const message =
      response.status === 401 || response.status === 403
        ? unauthorizedMessage(shopDomain, extracted)
        : extracted || `Shopify GraphQL ${response.status}`;
    const error = new Error(message);
    error.details = json;
    error.statusCode = response.status;
    if (response.status === 401 || response.status === 403) {
      error.code = "SHOPIFY_UNAUTHORIZED";
    }
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
  exchangeSessionToken,
  refreshOfflineToken,
  graphql,
  registerWebhooks,
  unauthorizedMessage,
};
