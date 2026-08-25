const { requireAudience } = require("../../middleware/auth");
const { AUDIENCE } = require("../../utils/jwt");
const env = require("../../config/env");
const service = require("./service");

const authenticateAdmin = requireAudience(AUDIENCE.platformAdmin);

async function platformRoutes(app) {
  app.post("/platform/auth/login", {
    schema: {
      tags: ["Platform"],
      summary: "Platform admin login",
    },
  }, async (request, reply) => {
    const data = await service.login(request, request.body || {});
    return reply.success({ message: "Signed in", data });
  });

  app.get("/platform/auth/me", {
    preHandler: authenticateAdmin,
    schema: {
      tags: ["Platform"],
      summary: "Current platform admin",
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    return reply.success({
      data: {
        id: request.user.sub,
        username: request.user.username,
        consolePath: env.adminConsolePath,
      },
    });
  });

  app.get("/platform/settings", {
    preHandler: authenticateAdmin,
    schema: {
      tags: ["Platform"],
      summary: "Get platform settings",
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, reply) => {
    return reply.success({ data: await service.getSettings() });
  });

  app.put("/platform/settings", {
    preHandler: authenticateAdmin,
    schema: {
      tags: ["Platform"],
      summary: "Update platform settings",
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const data = await service.updateSettings(request.body || {});
    return reply.success({ message: "Settings updated", data });
  });

  app.post("/platform/settings/cleanup", {
    preHandler: authenticateAdmin,
    schema: {
      tags: ["Platform"],
      summary: "Run retention cleanup immediately",
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const data = await service.runRetentionCleanup(request.body?.retentionDays);
    return reply.success({ message: "Retention cleanup executed", data });
  });
}

module.exports = platformRoutes;
