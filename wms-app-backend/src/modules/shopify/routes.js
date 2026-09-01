const { Readable } = require("stream");
const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const shops = require("../shops");
const service = require("./service");

const authenticateAdmin = requireAudience(AUDIENCE.platformAdmin);

function needsRawBody(url) {
  const path = String(url || "").split("?")[0];
  return path.endsWith("/shopify/webhooks") || path.endsWith("/shopify/fulfillment-notifications");
}

async function shopifyRoutes(app) {
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!needsRawBody(request.url)) {
      return payload;
    }

    const chunks = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    request.rawBody = buf;
    return Readable.from(buf);
  });

  app.get("/shopify/auth", {
    schema: { tags: ["Shopify"] },
  }, service.beginAuth);

  app.get("/shopify/auth/callback", {
    schema: { tags: ["Shopify"] },
  }, service.authCallback);

  app.post("/shopify/webhooks", {
    schema: { tags: ["Shopify"] },
  }, service.handleWebhook);

  const fulfillmentService = require("./fulfillmentService");
  app.post("/shopify/fulfillment-notifications", {
    schema: { tags: ["Shopify"] },
  }, fulfillmentService.handleNotification);

  app.get("/platform/shops/:id/events", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Shopify"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const shop = await shops.getById(request.params.id);
    return reply.success({ data: await service.listEvents(shop.shopDomain) });
  });

  app.post("/platform/events/:id/replay", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Shopify"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.replayEvent(request.params.id);
    return reply.success({ message: "Webhook replayed", data });
  });

  app.get("/", async (request, reply) => {
    if (request.query.shop) {
      return reply.redirect(`/api/shopify/auth?shop=${encodeURIComponent(String(request.query.shop))}`);
    }

    return reply
      .type("text/html")
      .send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>WMS Linker</title></head>
  <body style="font-family:sans-serif;padding:2rem">
    <h1>Connected to WMS Linker</h1>
    <p>Shopify requests land on this backend. Allowlist the shop domain in the platform console before orders are processed.</p>
  </body>
</html>`);
  });
}

module.exports = shopifyRoutes;
