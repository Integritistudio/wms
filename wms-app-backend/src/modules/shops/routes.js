const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const service = require("./service");

const authenticateAdmin = requireAudience(AUDIENCE.platformAdmin);

async function shopRoutes(app) {
  app.get("/platform/shops", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Shops"], security: [{ bearerAuth: [] }] },
  }, async (_request, reply) => {
    return reply.success({ data: await service.list() });
  });

  app.post("/platform/shops", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Shops"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.create(request.body || {});
    return reply.success({ message: "Shop added", data, statusCode: 201 });
  });

  app.get("/platform/shops/:id", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Shops"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const shop = await service.getById(request.params.id);
    return reply.success({ data: shop.toPublic() });
  });

  app.patch("/platform/shops/:id", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Shops"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const body = request.body || {};
    const data = body.companyId
      ? await service.assignToCompany(request.params.id, body.companyId, body.warehouseId)
      : await service.setEnabled(request.params.id, body.enabled);
    return reply.success({ message: "Shop updated", data });
  });

  app.post("/platform/shops/:id/test-connection", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Shops"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.testConnection(request.params.id);
    return reply.success({ message: `Connected to ${data.shopName}`, data });
  });
}

module.exports = shopRoutes;
