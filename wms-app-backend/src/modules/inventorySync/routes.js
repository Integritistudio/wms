const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const companies = require("../companies");
const service = require("./service");

const authenticateCompany = requireAudience(AUDIENCE.company);

function companyIdOf(user) {
  return companies.tenantId(user);
}

async function requireWarehouses(request, reply) {
  await authenticateCompany(request, reply);
  if (reply.sent) return;
  if (!companies.hasPermission(request.user, "warehouses")) {
    return reply.error({
      message: "Access denied: you do not have permission for warehouses",
      statusCode: 403,
    });
  }
}

async function inventorySyncRoutes(app) {
  app.get("/company/inventory-sync/product-links", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.listProductLinks(companyIdOf(request.user), {
      shopId: request.query.shopId,
      sku: request.query.sku,
    });
    return reply.success({ data });
  });

  app.patch("/company/inventory-sync/product-links/:id", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.updateProductLink(
      companyIdOf(request.user),
      request.params.id,
      request.body || {}
    );
    return reply.success({ message: "Product link updated", data });
  });

  app.post("/company/inventory-sync/shops/:shopId/sync-catalog", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.syncCatalogFromShopify(
      companyIdOf(request.user),
      request.params.shopId
    );
    return reply.success({ message: "Catalog synced", data });
  });

  app.get("/company/warehouses/:warehouseId/shopify-locations", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.listLocationMaps(
      companyIdOf(request.user),
      request.params.warehouseId
    );
    return reply.success({ data });
  });

  app.put("/company/warehouses/:warehouseId/shopify-locations", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.setLocationMap(
      companyIdOf(request.user),
      request.params.warehouseId,
      request.body || {}
    );
    return reply.success({ message: "Location mapped", data });
  });

  app.delete("/company/warehouses/:warehouseId/shopify-locations/:shopId", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.deleteLocationMap(
      companyIdOf(request.user),
      request.params.warehouseId,
      request.params.shopId
    );
    return reply.success({ message: "Location map removed", data });
  });

  app.get("/company/shops/:shopId/shopify-locations", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.listShopifyLocations(
      companyIdOf(request.user),
      request.params.shopId
    );
    return reply.success({ data });
  });

  app.post("/company/warehouses/:warehouseId/push-inventory-to-shopify", {
    preHandler: requireWarehouses,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.pushWarehouseToShopify(
      companyIdOf(request.user),
      request.params.warehouseId
    );
    return reply.success({ message: "Inventory push completed", data });
  });
}

module.exports = { inventorySyncRoutes, ...service };
