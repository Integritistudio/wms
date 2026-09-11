const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const shops = require("../shops");
const orders = require("../orders");
const service = require("./service");
const { httpError } = require("../../utils/httpError");

const authenticateAdmin = requireAudience(AUDIENCE.platformAdmin);
const authenticateCompany = requireAudience(AUDIENCE.company);

function requirePermission(moduleName) {
  return async function requirePermissionHandler(request, reply) {
    await authenticateCompany(request, reply);
    if (reply.sent) {
      return;
    }
    if (!service.hasPermission(request.user, moduleName)) {
      return reply.error({
        message: `Access denied: you do not have permission for ${moduleName}`,
        statusCode: 403,
      });
    }
  };
}

const requireOrders = requirePermission("orders");
const requireReturns = requirePermission("returns");
const requireFailed = requirePermission("failed");
const requireWarehouses = requirePermission("warehouses");
const requireSftp = requirePermission("sftp");
const requireRouting = requirePermission("routing");
const requireEmail = requirePermission("email");
const requireAnalytics = requirePermission("analytics");

function fulfillOrder() {
  return require("../shopify").fulfillOrder;
}

function requireRoot(request) {
  if (!service.isRoot(request.user)) {
    throw httpError(403, "Only the company root can do that");
  }
}

function companyIdOf(user) {
  return service.tenantId(user);
}

async function readUpload(request) {
  const file = await request.file();
  if (!file) {
    throw httpError(400, "EDI file is required");
  }
  const buffer = await file.toBuffer();
  return { body: buffer.toString("utf8"), fileName: file.filename || "945.edi" };
}

async function companyOrder(user, orderId) {
  const order = await orders.getById(orderId);
  const shop = await shops.getById(order.shopId);
  service.assertOrderAccess(user, shop, order);
  return { order, shop };
}

async function companyRoutes(app) {
  // --- Platform Admin: Company Management ---

  app.post("/platform/companies", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.create(request.body || {});
    return reply.success({
      message: data.inviteSent ? "Company invited" : "Company created. Invite email was not sent; copy the invite URL.",
      data,
      statusCode: 201,
    });
  });

  app.get("/platform/companies", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    return reply.success({ data: await service.list(request.query || {}) });
  });

  app.get("/platform/companies/:id", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    return reply.success({ data: await service.getDetail(request.params.id) });
  });

  app.patch("/platform/companies/:id", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.update(request.params.id, request.body || {});
    return reply.success({ message: "Company updated", data });
  });

  app.delete("/platform/companies/:id", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.softDelete(request.params.id);
    return reply.success({ message: "Company soft-deleted", data });
  });

  app.post("/platform/companies/:id/restore", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.restore(request.params.id);
    return reply.success({ message: "Company restored", data });
  });

  app.post("/platform/companies/:id/approve", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.approve(request.params.id);
    return reply.success({ message: "Company approved and activated", data });
  });

  app.post("/platform/companies/:id/reject", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.reject(request.params.id, request.body?.reason);
    return reply.success({ message: "Company rejected", data });
  });

  app.post("/platform/companies/:id/invite", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.resendInvite(request.params.id);
    return reply.success({ message: data.inviteSent ? "Invite sent" : "Invite ready", data });
  });

  app.post("/platform/companies/:id/shops", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await service.getById(request.params.id);
    const data = await shops.create({
      ...(request.body || {}),
      companyId: request.params.id,
    });
    return reply.success({ message: "Store attached", data, statusCode: 201 });
  });

  app.post("/platform/companies/:id/warehouses", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.addWarehouse(request.params.id, request.body || {});
    return reply.success({ message: "Warehouse added", data, statusCode: 201 });
  });

  // --- Public Auth & Onboarding ---

  app.post("/company/auth/signup", {
    schema: { tags: ["Companies"] },
  }, async (request, reply) => {
    const data = await service.signup(request.body || {});
    return reply.success({ message: data.message, data, statusCode: 201 });
  });

  app.get("/company/auth/invite/:token", {
    schema: { tags: ["Companies"] },
  }, async (request, reply) => {
    return reply.success({ data: await service.peekInvite(request.params.token) });
  });

  app.post("/company/auth/set-password", {
    schema: { tags: ["Companies"] },
  }, async (request, reply) => {
    const data = await service.setPassword(request.body || {});
    return reply.success({ message: "Password set", data });
  });

  app.post("/company/auth/login", {
    schema: { tags: ["Companies"] },
  }, async (request, reply) => {
    const data = await service.login(request, request.body || {});
    return reply.success({ message: "Signed in", data });
  });

  app.post("/company/auth/forgot-password", {
    schema: { tags: ["Companies"] },
  }, async (request, reply) => {
    const data = await service.forgotPassword(request, request.body || {});
    return reply.success({
      message: data.sent ? "If that email exists, a reset link was sent." : "Reset ready",
      data,
    });
  });

  app.post("/company/auth/reset-password", {
    schema: { tags: ["Companies"] },
  }, async (request, reply) => {
    const data = await service.resetPassword(request.body || {});
    return reply.success({ message: "Password updated", data });
  });

  app.get("/company/me", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    return reply.success({ data: await service.sessionFor(request.user) });
  });

  app.get("/company/appearance", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.getAppearance(companyIdOf(request.user));
    return reply.success({ data });
  });

  app.put("/company/appearance", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.updateAppearance(companyIdOf(request.user), request.body || {});
    return reply.success({ message: "Company appearance updated", data });
  });

  app.post("/company/shops/:id/test-connection", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const shop = await shops.getById(request.params.id);
    if (String(shop.companyId || "") !== String(companyIdOf(request.user))) {
      return reply.error({ message: "Shop not found", statusCode: 404 });
    }
    const data = await shops.testConnection(shop);
    return reply.success({ message: `Connected to ${data.shopName}`, data });
  });

  // --- Team Management (Root Only) ---

  app.get("/company/users", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    return reply.success({ data: await service.members.listByCompany(service.tenantId(request.user)) });
  });

  app.post("/company/users", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const company = await service.getById(service.tenantId(request.user));
    const data = await service.members.createMember(company, request.body || {});
    return reply.success({
      message: data.inviteSent ? "User invited" : "User created. Copy the invite URL.",
      data,
      statusCode: 201,
    });
  });

  app.patch("/company/users/:id", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const company = await service.getById(service.tenantId(request.user));
    const data = await service.members.updateMember(company, request.params.id, request.body || {});
    return reply.success({ message: "User updated", data });
  });

  app.post("/company/users/:id/invite", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const company = await service.getById(service.tenantId(request.user));
    const member = await service.members.getById(company._id, request.params.id);
    const invite = await service.members.issueInvite(member, company);
    return reply.success({
      message: invite.email.sent ? "Invite sent" : "Invite ready",
      data: { inviteSent: invite.email.sent, inviteUrl: invite.email.sent ? undefined : invite.url },
    });
  });

  app.post("/company/users/:id/reset", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const company = await service.getById(service.tenantId(request.user));
    const member = await service.members.getById(company._id, request.params.id);
    const reset = await service.members.issueReset(member, company);
    return reply.success({
      message: reset.email.sent ? "Reset email sent" : "Reset ready",
      data: { sent: reset.email.sent, resetUrl: reset.email.sent ? undefined : reset.url },
    });
  });

  // --- Warehouses (Permission: warehouses) ---

  app.post("/company/warehouses", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.addWarehouse(service.tenantId(request.user), request.body || {});
    return reply.success({ message: "Warehouse added", data, statusCode: 201 });
  });

  app.patch("/company/warehouses/:id", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.updateWarehouse(
      service.tenantId(request.user),
      request.params.id,
      request.body || {}
    );
    return reply.success({ message: "Warehouse updated", data });
  });

  const WarehouseTemplate = require("./warehouseTemplateModel");
  const { SHOPIFY_PATHS, OPERATORS } = require("../edi/templateBuilder");

  app.get("/company/warehouses/:id/template", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const template = await WarehouseTemplate.findOne({
      warehouseId: request.params.id,
      companyId: service.tenantId(request.user),
    });
    return reply.success({
      data: template ? template.toPublic() : null,
      meta: { shopifyPaths: SHOPIFY_PATHS, operators: OPERATORS },
    });
  });

  app.put("/company/warehouses/:id/template", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { format, csvDelimiter, csvHeaders, fields, x12Config } = request.body || {};
    const companyId = service.tenantId(request.user);
    const template = await WarehouseTemplate.findOneAndUpdate(
      { warehouseId: request.params.id, companyId },
      { warehouseId: request.params.id, companyId, format, csvDelimiter, csvHeaders, fields, x12Config },
      { upsert: true, returnDocument: "after", runValidators: true }
    );
    return reply.success({ message: "Template saved", data: template.toPublic() });
  });

  app.delete("/company/warehouses/:id/template", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await WarehouseTemplate.deleteOne({
      warehouseId: request.params.id,
      companyId: service.tenantId(request.user),
    });
    return reply.success({ message: "Template removed" });
  });

  const routing = require("../routing");

  app.get("/company/warehouses/:id/inventory", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const items = await routing.listInventory(companyIdOf(request.user), request.params.id);
    return reply.success({ data: items });
  });

  app.put("/company/warehouses/:id/inventory", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const items = await routing.upsertInventory(
      companyIdOf(request.user),
      request.params.id,
      request.body?.items || []
    );
    return reply.success({ data: items });
  });

  app.delete("/company/warehouses/:warehouseId/inventory/:sku", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await routing.deleteInventoryItem(companyIdOf(request.user), request.params.warehouseId, request.params.sku);
    return reply.success({ message: "Inventory item removed" });
  });

  const modernwms = require("../modernwms");

  app.get("/company/warehouses/:id/modernwms-config", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await modernwms.getModernwmsConfig(service.tenantId(request.user), request.params.id);
    return reply.success({ data });
  });

  app.put("/company/warehouses/:id/modernwms-config", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await modernwms.updateModernwmsConfig(
      service.tenantId(request.user),
      request.params.id,
      request.body || {}
    );
    return reply.success({ message: "ModernWMS config saved", data });
  });

  app.post("/company/warehouses/:id/modernwms-config/test", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await modernwms.testConnection(
      service.tenantId(request.user),
      request.params.id,
      request.body || {}
    );
    return reply.success({ message: "ModernWMS connection OK", data });
  });

  app.post("/company/warehouses/:id/modernwms/sync-inventory", {
    preHandler: requireWarehouses,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await modernwms.syncInventory(service.tenantId(request.user), request.params.id);
    return reply.success({ message: "Inventory synced from ModernWMS", data });
  });

  app.get("/company/orders/:id/modernwms-status", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await modernwms.getOrderModernwmsStatus(request.params.id);
    return reply.success({ data });
  });

  // --- SFTP (Permission: sftp) ---

  app.get("/company/sftp-connections", {
    preHandler: requireSftp,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    return reply.success({ data: await service.listSftpConnections(service.tenantId(request.user)) });
  });

  app.post("/company/sftp-connections", {
    preHandler: requireSftp,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.createSftpConnection(service.tenantId(request.user), request.body || {});
    return reply.success({ message: "SFTP connection saved", data, statusCode: 201 });
  });

  app.patch("/company/sftp-connections/:id", {
    preHandler: requireSftp,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.updateSftpConnection(
      service.tenantId(request.user),
      request.params.id,
      request.body || {}
    );
    return reply.success({ message: "SFTP connection updated", data });
  });

  app.post("/company/sftp-connections/:id/test", {
    preHandler: requireSftp,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.testSftpConnection(service.tenantId(request.user), request.params.id);
    return reply.success({ message: "SFTP connection succeeded", data });
  });

  app.patch("/company/sftp", {
    preHandler: requireSftp,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.updateSftp(service.tenantId(request.user), request.body || {});
    return reply.success({ message: "SFTP settings saved", data });
  });

  app.post("/company/sftp/test", {
    preHandler: requireSftp,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.testSftp(service.tenantId(request.user));
    return reply.success({ message: "SFTP connection succeeded", data });
  });

  // --- Orders & Shipments (Permission: orders) ---

  app.get("/company/orders", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.listOrdersForUser(request.user, request.query || {});
    return reply.success({ data });
  });

  app.get("/company/analytics", {
    preHandler: requireAnalytics,
    schema: {
      tags: ["Companies"],
      summary: "Company analytics dashboard aggregates",
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const analytics = require("./analyticsService");
    const companyId = companyIdOf(request.user);
    const warehouseIds =
      request.user.role === "warehouse" ? request.user.warehouseIds || [] : null;
    const data = await analytics.getCompanyAnalytics(companyId, {
      days: request.query?.days,
      from: request.query?.from,
      to: request.query?.to,
      warehouseIds,
    });
    return reply.success({ data });
  });

  app.patch("/company/orders/:id/warehouse", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (request.user.role === "warehouse") {
      throw httpError(403, "Warehouse users cannot reassign orders");
    }
    await companyOrder(request.user, request.params.id);
    const data = await orders.assignWarehouse(request.params.id, request.body?.warehouseId || null);
    return reply.success({ message: "Warehouse assigned", data });
  });

  app.get("/company/orders/:id/sample-945", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await orders.sample945(
      request.params.id,
      request.query?.trackingNumber,
      request.query?.carrier
    );
    return reply.success({ data });
  });

  app.post("/company/orders/:id/ship", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { order, shop } = await companyOrder(request.user, request.params.id);
    const data = await orders.apply945({
      order,
      shop,
      trackingNumber: request.body?.trackingNumber,
      carrier: request.body?.carrier,
      fulfillmentGroupId: request.body?.fulfillmentGroupId || null,
      status: request.body?.status || null,
      body: request.body?.body || null,
      fulfill: fulfillOrder(),
    });
    return reply.success({ message: "Shipment recorded", data });
  });

  const fulfillment = require("../fulfillment");

  app.get("/company/orders/:id/fulfillment", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await fulfillment.getOrderFulfillment(request.params.id);
    return reply.success({ data });
  });

  app.post("/company/orders/:id/allocate", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (request.user.role === "warehouse") {
      throw httpError(403, "Warehouse users cannot reallocate orders");
    }
    const { order, shop } = await companyOrder(request.user, request.params.id);
    const result = await fulfillment.allocateOrder(order, shop, {
      forceWarehouseId: request.body?.warehouseId || null,
    });
    return reply.success({
      message: result.hold ? "Order on hold" : "Allocated",
      data: {
        order: result.order.toPublic ? result.order.toPublic() : result.order,
        groups: (result.groups || []).map((g) => g.toPublic()),
        hold: result.hold,
      },
    });
  });

  app.post("/company/orders/:id/unallocate", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (request.user.role === "warehouse") {
      throw httpError(403, "Warehouse users cannot clear order allocation");
    }
    const { order, shop } = await companyOrder(request.user, request.params.id);
    const result = await fulfillment.unallocateOrder(order, shop);
    return reply.success({
      message: "Allocation cleared — assign a warehouse to allocate again",
      data: {
        order: result.order.toPublic ? result.order.toPublic() : result.order,
        groups: [],
      },
    });
  });

  app.post("/company/fulfillment-groups/:id/ship", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const FulfillmentGroup = require("../fulfillment/groupModel");
    const group = await FulfillmentGroup.findById(request.params.id);
    if (!group || String(group.companyId) !== String(companyIdOf(request.user))) {
      return reply.error({ message: "Not found", statusCode: 404 });
    }
    if (request.user.role === "warehouse") {
      const allowed = (request.user.warehouseIds || []).map(String);
      if (!group.warehouseId || !allowed.includes(String(group.warehouseId))) {
        return reply.error({ message: "This fulfillment group is not assigned to your warehouse", statusCode: 403 });
      }
    }
    const data = await fulfillment.shipGroup({
      groupId: group._id,
      trackingNumber: request.body?.trackingNumber,
      carrier: request.body?.carrier,
      fulfill: fulfillOrder(),
    });
    return reply.success({ message: "Group shipped", data });
  });

  app.post("/company/fulfillment-groups/:id/sync-shopify", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const FulfillmentGroup = require("../fulfillment/groupModel");
    const group = await FulfillmentGroup.findById(request.params.id);
    if (!group || String(group.companyId) !== String(companyIdOf(request.user))) {
      return reply.error({ message: "Not found", statusCode: 404 });
    }
    const data = await fulfillment.syncGroupToShopify({
      groupId: group._id,
      fulfill: fulfillOrder(),
    });
    return reply.success({ message: "Synced to Shopify", data });
  });

  app.post("/company/orders/:id/sync-shopify", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await fulfillment.syncOrderToShopify({
      orderId: request.params.id,
      fulfill: fulfillOrder(),
      force: Boolean(request.body?.force),
    });
    const message = data.errors?.length
      ? `Synced ${data.syncedCount} group(s) with ${data.errors.length} error(s)`
      : `Synced ${data.syncedCount} group(s) to Shopify`;
    return reply.success({ message, data });
  });

  app.patch("/company/shipments/:id/status", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await fulfillment.updateShipmentStatus({
      shipmentId: request.params.id,
      companyId: companyIdOf(request.user),
      status: request.body?.status,
      note: request.body?.note,
      happenedAt: request.body?.happenedAt,
      trackingUrl: request.body?.trackingUrl,
    });
    return reply.success({ message: `Shipment marked ${request.body?.status}`, data });
  });

  app.post("/company/orders/:id/945", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { order, shop } = await companyOrder(request.user, request.params.id);
    const ct = String(request.headers["content-type"] || "");
    let body;
    let fileName = "945.edi";
    let fulfillmentGroupId = request.query?.fulfillmentGroupId || null;
    let status = request.query?.status || null;

    if (ct.includes("application/json")) {
      body = request.body?.body;
      if (body && typeof body === "object") {
        body = JSON.stringify(body);
      }
      if (!body && (request.body?.trackingNumber || request.body?.status)) {
        body = JSON.stringify({
          trackingNumber: request.body.trackingNumber,
          carrier: request.body.carrier || "UPS",
          status: request.body.status,
          fulfillmentGroupId: request.body.fulfillmentGroupId,
        });
      }
      fileName = request.body?.fileName || `945-${order.orderNumber || order.id}.edi`;
      fulfillmentGroupId = request.body?.fulfillmentGroupId || fulfillmentGroupId;
      status = request.body?.status || status;
    } else {
      const upload = await readUpload(request);
      body = upload.body;
      fileName = upload.fileName;
    }

    const data = await orders.apply945({
      order,
      shop,
      body,
      fileName,
      fulfillmentGroupId,
      status,
      trackingNumber: request.body?.trackingNumber,
      carrier: request.body?.carrier,
      fulfill: fulfillOrder(),
    });
    return reply.success({ message: "945 processed", data });
  });

  const activityLogs = require("../logs");

  app.get("/company/orders/:id/logs", {
    preHandler: requireOrders,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await activityLogs.listForOrder(request.params.id);
    return reply.success({ data });
  });

  // --- Returns / RMA (Permission: returns) ---

  const returns = require("../fulfillment/returns");

  app.get("/company/returns", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const warehouseIds = request.user.role === "warehouse" ? request.user.warehouseIds : null;
    const data = await returns.listReturns(companyIdOf(request.user), {
      status: request.query?.status,
      orderId: request.query?.orderId,
      q: request.query?.q,
      warehouseIds,
      limit: request.query?.limit,
    });
    return reply.success({ data });
  });

  app.get("/company/returns/:id", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.getReturn(companyIdOf(request.user), request.params.id, request.user);
    return reply.success({ data });
  });

  app.post("/company/returns", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.createReturn(companyIdOf(request.user), request.body || {});
    return reply.success({ message: "Return created", data, statusCode: 201 });
  });

  app.post("/company/orders/:id/returns", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await returns.createReturn(companyIdOf(request.user), {
      ...(request.body || {}),
      orderId: request.params.id,
    });
    return reply.success({ message: "Return created", data, statusCode: 201 });
  });

  app.patch("/company/returns/:id/status", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await returns.getReturn(companyIdOf(request.user), request.params.id, request.user);
    const data = await returns.transitionReturn(companyIdOf(request.user), request.params.id, request.body || {});
    return reply.success({ message: `Return marked ${request.body?.status}`, data });
  });

  app.post("/company/returns/:id/receive", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await returns.getReturn(companyIdOf(request.user), request.params.id, request.user);
    const data = await returns.receiveReturn(companyIdOf(request.user), request.params.id, request.body || {});
    return reply.success({ message: "Return received", data });
  });

  app.post("/company/returns/:id/restock", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await returns.getReturn(companyIdOf(request.user), request.params.id, request.user);
    const data = await returns.restockReturn(companyIdOf(request.user), request.params.id, request.body || {});
    return reply.success({ message: "Return restocked", data });
  });

  app.delete("/company/returns/:id", {
    preHandler: requireReturns,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await returns.getReturn(companyIdOf(request.user), request.params.id, request.user);
    const data = await returns.softDeleteReturn(companyIdOf(request.user), request.params.id);
    return reply.success({ message: data.message });
  });

  // --- DLQ (Failed Orders) (Permission: failed) ---

  const dlq = require("../orders/failedOrderService");

  app.get("/company/failed-orders", {
    preHandler: requireFailed,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const companyId = service.tenantId(request.user);
    const warehouseIds = request.user.role === "warehouse" ? request.user.warehouseIds : null;
    const data = await dlq.listByCompany(companyId, {
      resolved: request.query?.resolved === "true",
      q: request.query?.q,
      page: request.query?.page,
      limit: request.query?.limit,
      warehouseIds,
    });
    return reply.success({ data });
  });

  app.get("/company/failed-orders/count", {
    preHandler: requireFailed,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const warehouseIds = request.user.role === "warehouse" ? request.user.warehouseIds : null;
    const count = await dlq.countByCompany(service.tenantId(request.user), warehouseIds);
    return reply.success({ data: { count } });
  });

  app.post("/company/failed-orders/:id/retry", {
    preHandler: requireFailed,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const entry = await dlq.getById(request.params.id);
    if (String(entry.companyId) !== String(service.tenantId(request.user))) {
      return reply.error({ message: "Forbidden", statusCode: 403 });
    }
    if (request.user.role === "warehouse") {
      const allowed = (request.user.warehouseIds || []).map(String);
      if (entry.warehouseId && !allowed.includes(String(entry.warehouseId))) {
        return reply.error({ message: "Forbidden: Record belongs to another warehouse", statusCode: 403 });
      }
    }
    const order = await orders.getById(entry.orderId);
    const shop = await shops.getById(order.shopId);
    const result = await fulfillment.allocateOrder(order, shop, {
      forceWarehouseId: order.warehouseId ? String(order.warehouseId) : null,
    });
    if (result.failed || result.hold) {
      return reply.error({
        message: result.order?.lastError || result.order?.routingReason || "Retry did not allocate the order",
        statusCode: 400,
      });
    }
    await dlq.resolve(entry._id, { resolution: "retried", resolvedBy: request.user.email || request.user.name });
    return reply.success({ message: "Retried" });
  });

  app.post("/company/failed-orders/:id/reassign", {
    preHandler: requireFailed,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (request.user.role === "warehouse") {
      throw httpError(403, "Warehouse users cannot reassign failed orders");
    }
    const entry = await dlq.getById(request.params.id);
    if (String(entry.companyId) !== String(service.tenantId(request.user))) {
      return reply.error({ message: "Forbidden", statusCode: 403 });
    }
    const warehouseId = request.body?.warehouseId;
    if (!warehouseId) return reply.error({ message: "warehouseId required", statusCode: 400 });
    await orders.assignWarehouse(String(entry.orderId), warehouseId);
    await dlq.resolve(entry._id, { resolution: "reassigned", resolvedBy: request.user.email || request.user.name });
    return reply.success({ message: "Reassigned and retried" });
  });

  app.post("/company/failed-orders/:id/skip", {
    preHandler: requireFailed,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const entry = await dlq.getById(request.params.id);
    if (String(entry.companyId) !== String(service.tenantId(request.user))) {
      return reply.error({ message: "Forbidden", statusCode: 403 });
    }
    if (request.user.role === "warehouse") {
      const allowed = (request.user.warehouseIds || []).map(String);
      if (entry.warehouseId && !allowed.includes(String(entry.warehouseId))) {
        return reply.error({ message: "Forbidden: Record belongs to another warehouse", statusCode: 403 });
      }
    }
    await dlq.resolve(entry._id, { resolution: "skipped", resolvedBy: request.user.email || request.user.name });
    return reply.success({ message: "Skipped" });
  });

  // --- Notifications ---

  const notifications = require("../notifications");

  app.get("/company/notifications", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const unreadOnly = request.query.unread === "true";
    const data = await notifications.listByCompany(service.tenantId(request.user), {
      unreadOnly,
      page: request.query?.page,
      limit: request.query?.limit,
    });
    const unreadCount = await notifications.countUnread(service.tenantId(request.user));
    return reply.success({ data: { ...data, unreadCount } });
  });

  app.post("/company/notifications/read-all", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await notifications.markAllRead(service.tenantId(request.user));
    return reply.success({ message: "All marked as read" });
  });

  app.post("/company/notifications/:id/read", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await notifications.markRead(request.params.id);
    return reply.success({ message: "Marked as read" });
  });

  // --- SMTP Settings (Permission: email) ---

  app.get("/company/smtp-settings", {
    preHandler: requireEmail,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const settings = await notifications.getSmtpSettings(service.tenantId(request.user));
    return reply.success({ data: settings });
  });

  app.put("/company/smtp-settings", {
    preHandler: requireEmail,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const saved = await notifications.saveSmtpSettings(service.tenantId(request.user), request.body);
    return reply.success({ data: saved });
  });

  app.post("/company/smtp-settings/test", {
    preHandler: requireEmail,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await notifications.testSmtp(service.tenantId(request.user));
    return reply.success({ message: "Test email sent successfully" });
  });

  // --- Order Routing (Permission: routing) ---

  app.get("/company/routing/config", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const config = await routing.getConfig(service.tenantId(request.user));
    return reply.success({
      data: config,
      meta: { fields: routing.ROUTING_FIELDS, operators: routing.OPERATORS },
    });
  });

  app.put("/company/routing/config", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const saved = await routing.saveConfig(service.tenantId(request.user), request.body || {});
    return reply.success({ data: saved });
  });

  app.get("/company/routing/rules", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    return reply.success({ data: await routing.listRules(service.tenantId(request.user)) });
  });

  app.post("/company/routing/rules", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const rule = await routing.createRule(service.tenantId(request.user), request.body || {});
    return reply.success({ data: rule, statusCode: 201 });
  });

  app.put("/company/routing/rules/:id", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const rule = await routing.updateRule(service.tenantId(request.user), request.params.id, request.body || {});
    return reply.success({ data: rule });
  });

  app.delete("/company/routing/rules/:id", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await routing.deleteRule(service.tenantId(request.user), request.params.id);
    return reply.success({ message: "Rule deleted" });
  });

  app.post("/company/routing/rules/reorder", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const orderedIds = request.body?.orderedIds || [];
    const rules = await routing.reorderRules(service.tenantId(request.user), orderedIds);
    return reply.success({ data: rules });
  });

  app.post("/company/routing/test", {
    preHandler: requireRouting,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const result = await routing.testRouting(service.tenantId(request.user), request.body?.order || request.body || {});
    return reply.success({ data: result });
  });
}

module.exports = companyRoutes;
