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
    const data = await service.listOrdersForUser(request.user);
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
      fulfill: fulfillOrder(),
    });
    return reply.success({ message: "Shipment recorded", data });
  });

  app.post("/company/orders/:id/945", {
    preHandler: authenticateCompany,
    schema: { tags: ["Companies"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const upload = await readUpload(request);
    const { order, shop } = await companyOrder(request.user, request.params.id);
    const data = await orders.apply945({
      order,
      shop,
      body: upload.body,
      fileName: upload.fileName,
      fulfill: fulfillOrder(),
    });
    return reply.success({ message: "945 processed", data });
  });
}

module.exports = companyRoutes;
