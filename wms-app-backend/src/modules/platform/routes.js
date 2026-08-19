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
}

module.exports = platformRoutes;
