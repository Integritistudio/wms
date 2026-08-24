const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const shops = require("../shops");
const orders = require("../orders");
const shopify = require("../shopify");
const service = require("./service");

const authenticateAdmin = requireAudience(AUDIENCE.platformAdmin);
const authenticateUploader = requireAudience(AUDIENCE.uploader);

async function readUpload(request) {
  const file = await request.file();
  if (!file) {
    const error = new Error("EDI file is required");
    error.statusCode = 400;
    throw error;
  }
  const buffer = await file.toBuffer();
  return { body: buffer.toString("utf8"), fileName: file.filename || "945.edi" };
}

async function uploaderRoutes(app) {
  app.post("/platform/shops/:id/uploaders", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Uploaders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.create({
      username: request.body?.username,
      password: request.body?.password,
      shopId: request.params.id,
    });
    return reply.success({ message: "Uploader created", data, statusCode: 201 });
  });

  app.get("/platform/shops/:id/uploaders", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Uploaders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    return reply.success({ data: await service.listByShop(request.params.id) });
  });

  app.post("/platform/orders/:id/945", {
    preHandler: authenticateAdmin,
    schema: { tags: ["Orders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const upload = await readUpload(request);
    const order = await orders.getById(request.params.id);
    const shop = await shops.getById(order.shopId);
    const data = await orders.apply945({
      order,
      shop,
      body: upload.body,
      fileName: upload.fileName,
      fulfill: shopify.fulfillOrder,
    });
    return reply.success({ message: "945 processed", data });
  });

  app.post("/uploader/auth/login", {
    schema: { tags: ["Uploaders"] },
  }, async (request, reply) => {
    const data = await service.login(request, request.body || {});
    return reply.success({ message: "Signed in", data });
  });

  app.get("/uploader/orders", {
    preHandler: authenticateUploader,
    schema: { tags: ["Uploaders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await service.assignedOrders(request.user.sub, request.query || {});
    return reply.success({ data });
  });

  app.post("/uploader/orders/:id/945", {
    preHandler: authenticateUploader,
    schema: { tags: ["Uploaders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const upload = await readUpload(request);
    const data = await service.upload945({
      user: request.user,
      orderId: request.params.id,
      body: upload.body,
      fileName: upload.fileName,
    });
    return reply.success({ message: "945 processed", data });
  });

  app.post("/uploader/orders/:id/ship", {
    preHandler: authenticateUploader,
    schema: { tags: ["Uploaders"], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const order = await orders.getById(request.params.id);
    service.assertShopAccess(request.user, order.shopId);
    const shop = await shops.getById(order.shopId);
    const data = await orders.apply945({
      order,
      shop,
      trackingNumber: request.body?.trackingNumber,
      carrier: request.body?.carrier,
      fulfill: shopify.fulfillOrder,
    });
    return reply.success({ message: "Shipment recorded", data });
  });
}

module.exports = uploaderRoutes;
