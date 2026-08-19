const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const shops = require("../shops");
const files = require("../files");
const service = require("./service");

const authenticateAdmin = requireAudience(AUDIENCE.platformAdmin);

function fulfillOrder() {
  return require("../shopify").fulfillOrder;
}

async function orderRoutes(app) {
  app.get("/platform/shops/:id/orders", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await shops.getById(request.params.id);
    return reply.success({ data: await service.listByShop(request.params.id) });
  });

  app.post("/platform/shops/:id/simulate-order", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const result = await service.simulate(request.params.id, request.body || {});
    return reply.success({ message: "Demo order created", data: result.order, statusCode: 201 });
  });

  app.get("/platform/orders/:id", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const order = await service.getById(request.params.id);
    return reply.success({ data: order.toPublic() });
  });

  app.get("/platform/orders/:id/sample-945", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.sample945(
      request.params.id,
      request.query?.trackingNumber,
      request.query?.carrier
    );
    return reply.success({ data });
  });

  app.post("/platform/orders/:id/ship", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const order = await service.getById(request.params.id);
    const shop = await shops.getById(order.shopId);
    const data = await service.apply945({
      order,
      shop,
      trackingNumber: request.body?.trackingNumber,
      carrier: request.body?.carrier,
      fulfill: fulfillOrder(),
    });
    return reply.success({ message: "Shipment recorded", data });
  });

  app.post("/platform/orders/:id/file-link", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.protectLink(request.params.id, request.body?.password);
    return reply.success({ message: "Download link ready", data });
  });

  app.post("/platform/orders/:id/email-link", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const order = await service.getById(request.params.id);
    if (!order.fileLink?.token) {
      return reply.error({ message: "No file link yet", statusCode: 400 });
    }
    const result = await files.emailLink({
      token: order.fileLink.token,
      to: request.body?.to || order.email,
      subject: `EDI 940 for order ${order.orderNumber}`,
    });
    return reply.success({ message: result.sent ? "Email sent" : "Email skipped", data: result });
  });
}

module.exports = orderRoutes;
