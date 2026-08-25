const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const shops = require("../shops");
const orders = require("../orders");
const service = require("./service");
const { httpError } = require("../../utils/httpError");

const authenticateAdmin = requireAudience(AUDIENCE.platformAdmin);
const authenticateCompany = requireAudience(AUDIENCE.company);

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
  }, async (_request, reply) => {
    return reply.success({ data: await service.list() });
  });

  app.get("/platform/companies/:id", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    return reply.success({ data: await service.getDetail(request.params.id) });
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

  app.post("/company/warehouses", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.addWarehouse(service.tenantId(request.user), request.body || {});
    return reply.success({ message: "Warehouse added", data, statusCode: 201 });
  });

  app.patch("/company/warehouses/:id", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.updateWarehouse(
      service.tenantId(request.user),
      request.params.id,
      request.body || {}
    );
    return reply.success({ message: "Warehouse updated", data });
  });

  app.get("/company/sftp-connections", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    return reply.success({ data: await service.listSftpConnections(service.tenantId(request.user)) });
  });

  app.post("/company/sftp-connections", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.createSftpConnection(service.tenantId(request.user), request.body || {});
    return reply.success({ message: "SFTP connection saved", data, statusCode: 201 });
  });

  app.patch("/company/sftp-connections/:id", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.updateSftpConnection(
      service.tenantId(request.user),
      request.params.id,
      request.body || {}
    );
    return reply.success({ message: "SFTP connection updated", data });
  });

  app.post("/company/sftp-connections/:id/test", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.testSftpConnection(service.tenantId(request.user), request.params.id);
    return reply.success({ message: "SFTP connection succeeded", data });
  });

  app.patch("/company/sftp", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.updateSftp(service.tenantId(request.user), request.body || {});
    return reply.success({ message: "SFTP settings saved", data });
  });

  app.post("/company/sftp/test", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const data = await service.testSftp(service.tenantId(request.user));
    return reply.success({ message: "SFTP connection succeeded", data });
  });

  app.get("/company/orders", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.listOrdersForUser(request.user, request.query || {});
    return reply.success({ data });
  });

  app.patch("/company/orders/:id/warehouse", {
    preHandler: authenticateCompany,
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
    preHandler: authenticateCompany,
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
    preHandler: authenticateCompany,
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

  // --- Fulfillment groups / shipments ---
  const fulfillment = require("../fulfillment");

  app.get("/company/orders/:id/fulfillment", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await fulfillment.getOrderFulfillment(request.params.id);
    return reply.success({ data });
  });

  app.post("/company/orders/:id/allocate", {
    preHandler: authenticateCompany,
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

  app.post("/company/fulfillment-groups/:id/ship", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const FulfillmentGroup = require("../fulfillment/groupModel");
    const group = await FulfillmentGroup.findById(request.params.id);
    if (!group || String(group.companyId) !== String(companyIdOf(request.user))) {
      return reply.error({ message: "Not found", statusCode: 404 });
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
    preHandler: authenticateCompany,
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
    preHandler: authenticateCompany,
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
    preHandler: authenticateCompany,
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

  // --- Returns / RMA ---
  const returns = require("../fulfillment/returns");

  app.get("/company/returns", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.listReturns(companyIdOf(request.user), {
      status: request.query?.status,
      orderId: request.query?.orderId,
      q: request.query?.q,
      limit: request.query?.limit,
    });
    return reply.success({ data });
  });

  app.get("/company/returns/:id", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.getReturn(companyIdOf(request.user), request.params.id);
    return reply.success({ data });
  });

  app.post("/company/returns", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.createReturn(companyIdOf(request.user), request.body || {});
    return reply.success({ message: "Return created", data, statusCode: 201 });
  });

  app.post("/company/orders/:id/returns", {
    preHandler: authenticateCompany,
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
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.transitionReturn(companyIdOf(request.user), request.params.id, request.body || {});
    return reply.success({ message: `Return marked ${request.body?.status}`, data });
  });

  app.post("/company/returns/:id/receive", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.receiveReturn(companyIdOf(request.user), request.params.id, request.body || {});
    return reply.success({ message: "Return received", data });
  });

  app.post("/company/returns/:id/restock", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await returns.restockReturn(companyIdOf(request.user), request.params.id, request.body || {});
    return reply.success({ message: "Return restocked", data });
  });

  app.post("/company/orders/:id/945", {
    preHandler: authenticateCompany,
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
  // --- Warehouse 940 Template ---

  const WarehouseTemplate = require("./warehouseTemplateModel");
  const { SHOPIFY_PATHS, OPERATORS } = require("../edi/templateBuilder");

  app.get("/company/warehouses/:id/template", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const template = await WarehouseTemplate.findOne({ warehouseId: request.params.id, companyId: request.user.companyId });
    return reply.success({ data: template ? template.toPublic() : null, meta: { shopifyPaths: SHOPIFY_PATHS, operators: OPERATORS } });
  });

  app.put("/company/warehouses/:id/template", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { format, csvDelimiter, csvHeaders, fields, x12Config } = request.body || {};
    const template = await WarehouseTemplate.findOneAndUpdate(
      { warehouseId: request.params.id, companyId: request.user.companyId },
      { warehouseId: request.params.id, companyId: request.user.companyId, format, csvDelimiter, csvHeaders, fields, x12Config },
      { upsert: true, returnDocument: "after", runValidators: true }
    );
    return reply.success({ message: "Template saved", data: template.toPublic() });
  });

  app.delete("/company/warehouses/:id/template", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await WarehouseTemplate.deleteOne({ warehouseId: request.params.id, companyId: request.user.companyId });
    return reply.success({ message: "Template removed" });
  });

  // --- Order Activity Logs ---

  const activityLogs = require("../logs");

  app.get("/company/orders/:id/logs", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await companyOrder(request.user, request.params.id);
    const data = await activityLogs.listForOrder(request.params.id);
    return reply.success({ data });
  });

  // --- DLQ (Failed Orders) ---

  const dlq = require("../orders/failedOrderService");

  app.get("/company/failed-orders", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const companyId = request.user.companyId;
    const data = await dlq.listByCompany(companyId, {
      resolved: request.query?.resolved === "true",
      q: request.query?.q,
      page: request.query?.page,
      limit: request.query?.limit,
    });
    return reply.success({ data });
  });

  app.get("/company/failed-orders/count", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const count = await dlq.countByCompany(request.user.companyId);
    return reply.success({ data: { count } });
  });

  app.post("/company/failed-orders/:id/retry", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const entry = await dlq.getById(request.params.id);
    if (String(entry.companyId) !== String(request.user.companyId)) {
      return reply.error({ message: "Forbidden", statusCode: 403 });
    }
    const order = await orders.getById(entry.orderId);
    const shop = await shops.getById(order.shopId);
    const fulfillment = require("../fulfillment");
    const result = await fulfillment.allocateOrder(order, shop, {
      forceWarehouseId: order.warehouseId ? String(order.warehouseId) : null,
    });
    if (result.failed || result.hold) {
      return reply.error({
        message: result.order?.lastError || result.order?.routingReason || "Retry did not allocate the order",
        statusCode: 400,
      });
    }
    await dlq.resolve(entry._id, { resolution: "retried", resolvedBy: request.user.username || request.user.userId });
    return reply.success({ message: "Retried" });
  });

  app.post("/company/failed-orders/:id/reassign", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const entry = await dlq.getById(request.params.id);
    if (String(entry.companyId) !== String(request.user.companyId)) {
      return reply.error({ message: "Forbidden", statusCode: 403 });
    }
    const warehouseId = request.body?.warehouseId;
    if (!warehouseId) return reply.error({ message: "warehouseId required", statusCode: 400 });
    await orders.assignWarehouse(String(entry.orderId), warehouseId);
    await dlq.resolve(entry._id, { resolution: "reassigned", resolvedBy: request.user.username || request.user.userId });
    return reply.success({ message: "Reassigned and retried" });
  });

  app.post("/company/failed-orders/:id/skip", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const entry = await dlq.getById(request.params.id);
    if (String(entry.companyId) !== String(request.user.companyId)) {
      return reply.error({ message: "Forbidden", statusCode: 403 });
    }
    await dlq.resolve(entry._id, { resolution: "skipped", resolvedBy: request.user.username || request.user.userId });
    return reply.success({ message: "Skipped" });
  });

  // --- Notifications ---
  const notifications = require("../notifications");

  app.get("/company/notifications", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const unreadOnly = request.query.unread === "true";
    const data = await notifications.listByCompany(request.user.companyId, {
      unreadOnly,
      page: request.query?.page,
      limit: request.query?.limit,
    });
    const unreadCount = await notifications.countUnread(request.user.companyId);
    return reply.success({ data: { ...data, unreadCount } });
  });

  app.post("/company/notifications/read-all", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await notifications.markAllRead(request.user.companyId);
    return reply.success({ message: "All marked as read" });
  });

  app.post("/company/notifications/:id/read", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    await notifications.markRead(request.params.id);
    return reply.success({ message: "Marked as read" });
  });

  // --- SMTP Settings ---
  app.get("/company/smtp-settings", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const settings = await notifications.getSmtpSettings(request.user.companyId);
    return reply.success({ data: settings });
  });

  app.put("/company/smtp-settings", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const saved = await notifications.saveSmtpSettings(request.user.companyId, request.body);
    return reply.success({ data: saved });
  });

  app.post("/company/smtp-settings/test", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    await notifications.testSmtp(request.user.companyId);
    return reply.success({ message: "Test email sent successfully" });
  });

  // --- Order Routing ---
  const routing = require("../routing");

  app.get("/company/routing/config", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const config = await routing.getConfig(request.user.companyId);
    return reply.success({
      data: config,
      meta: { fields: routing.ROUTING_FIELDS, operators: routing.OPERATORS },
    });
  });

  app.put("/company/routing/config", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const saved = await routing.saveConfig(request.user.companyId, request.body || {});
    return reply.success({ data: saved });
  });

  app.get("/company/routing/rules", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    return reply.success({ data: await routing.listRules(request.user.companyId) });
  });

  app.post("/company/routing/rules", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const rule = await routing.createRule(request.user.companyId, request.body || {});
    return reply.success({ data: rule, statusCode: 201 });
  });

  app.put("/company/routing/rules/:id", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const rule = await routing.updateRule(request.user.companyId, request.params.id, request.body || {});
    return reply.success({ data: rule });
  });

  app.delete("/company/routing/rules/:id", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    await routing.deleteRule(request.user.companyId, request.params.id);
    return reply.success({ message: "Rule deleted" });
  });

  app.post("/company/routing/rules/reorder", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const orderedIds = request.body?.orderedIds || [];
    const rules = await routing.reorderRules(request.user.companyId, orderedIds);
    return reply.success({ data: rules });
  });

  app.post("/company/routing/test", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const result = await routing.testRouting(request.user.companyId, request.body?.order || request.body || {});
    return reply.success({ data: result });
  });

  app.get("/company/warehouses/:id/inventory", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const items = await routing.listInventory(companyIdOf(request.user), request.params.id);
    return reply.success({ data: items });
  });

  app.put("/company/warehouses/:id/inventory", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    const items = await routing.upsertInventory(
      companyIdOf(request.user),
      request.params.id,
      request.body?.items || []
    );
    return reply.success({ data: items });
  });

  app.delete("/company/warehouses/:warehouseId/inventory/:sku", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    requireRoot(request);
    await routing.deleteInventoryItem(companyIdOf(request.user), request.params.warehouseId, request.params.sku);
    return reply.success({ message: "Inventory item removed" });
  });
}

module.exports = companyRoutes;
