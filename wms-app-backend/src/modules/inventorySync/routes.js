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
  const storeService = require("./storeService");
  async function requireStoreManager(request, reply) {
    await requireWarehouses(request, reply);
    if (!reply.sent && request.user.role === "warehouse") return reply.error({ message: "Company users manage stores", statusCode: 403 });
  }
  app.get("/company/shops", { preHandler: requireStoreManager }, async (request, reply) => {
    return reply.success({ data: await require("../shops").listByCompany(companyIdOf(request.user)) });
  });
  app.put("/company/shops/:shopId/warehouses", { preHandler: requireStoreManager }, async (request, reply) => {
    return reply.success({ message: "Store warehouses saved; inventory sync queued", data: await storeService.configure(companyIdOf(request.user), request.params.shopId, request.body || {}) });
  });
  app.patch("/company/shops/:shopId", { preHandler: requireStoreManager }, async (request, reply) => {
    const body = request.body || {};
    if (body.enabled === undefined) {
      return reply.error({ message: "Nothing to update", statusCode: 400 });
    }
    const shop = await storeService.owned(companyIdOf(request.user), request.params.shopId);
    shop.enabled = Boolean(body.enabled);
    await shop.save();
    return reply.success({ message: body.enabled ? "Store enabled" : "Store disabled", data: shop.toPublic() });
  });
  app.delete("/company/shops/:shopId", { preHandler: requireStoreManager }, async (request, reply) => {
    if (!companies.isRoot(request.user)) {
      return reply.error({
        message: "Only the company root can remove Shopify stores",
        statusCode: 403,
      });
    }
    const shops = require("../shops");
    const data = await shops.removeFromCompany(companyIdOf(request.user), request.params.shopId);
    return reply.success({ message: "Store removed from company", data });
  });
  app.post("/company/shops/:shopId/sync-inventory", { preHandler: requireStoreManager }, async (request, reply) => {
    const shop = await storeService.owned(companyIdOf(request.user), request.params.shopId);
    shop.inventorySyncPending = true;
    await shop.save();
    if (require("../shops").isProcessable(shop)) await storeService.enqueueStore(shop);
    return reply.success({ message: "Inventory sync queued", data: shop.toPublic() });
  });
  app.post("/company/shops/connect", {
    preHandler: requireStoreManager,
    schema: { tags: ["InventorySync"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (!companies.isRoot(request.user)) {
      return reply.error({
        message: "Only the company root can add Shopify stores",
        statusCode: 403,
      });
    }
    const shops = require("../shops");
    const { shopDomain, warehouseId, warehouseIds } = request.body || {};
    const companyId = companyIdOf(request.user);
    let data;
    try {
      data = await shops.create({ shopDomain, companyId, warehouseIds: warehouseIds ?? (warehouseId ? [warehouseId] : []), enabled: true });
    } catch (error) {
      // A merchant can safely reconnect a previously installed/uninstalled
      // store. Never permit this endpoint to take over another company's shop.
      if (error.statusCode !== 409) throw error;
      const existing = await shops.findByDomain(shopDomain);
      if (!existing || String(existing.companyId) !== String(companyId)) throw error;
      data = existing.toPublic();
    }
    const env = require("../../config/env");
    return reply.success({
      message: "Shop created. Continue to Shopify to install WMS Linker; WMS stock will replace Shopify stock after installation.",
      data: { shop: data, installUrl: env.shopifyApiUrl(`/shopify/auth?shop=${encodeURIComponent(data.shopDomain)}`) },
      statusCode: 201,
    });
  });

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
