const { pingDb, getDbStatus } = require("../db/connect");
const { apiResponseSchema } = require("../utils/openapi");

const healthDataSchema = {
  type: "object",
  properties: {
    status: { type: "string", example: "ok" },
    uptime: { type: "number" },
  },
};

const dbStatusSchema = {
  type: "object",
  properties: {
    connected: { type: "boolean" },
    status: { type: "string", example: "connected" },
    host: { type: ["string", "null"] },
    name: { type: ["string", "null"] },
  },
};

async function healthRoutes(fastify) {
  fastify.get("/health", {
    schema: {
      tags: ["Health"],
      summary: "Server health",
      response: {
        200: apiResponseSchema(healthDataSchema),
      },
    },
  }, async (request, reply) => {
    return reply.success({
      message: "Server is healthy",
      data: {
        status: "ok",
        uptime: process.uptime(),
      },
    });
  });

  fastify.get("/health/db", {
    schema: {
      tags: ["Health"],
      summary: "MongoDB connection check",
      response: {
        200: apiResponseSchema(dbStatusSchema),
        503: apiResponseSchema(dbStatusSchema),
      },
    },
  }, async (request, reply) => {
    try {
      const data = await pingDb();

      return reply.success({
        message: "Database is connected",
        data,
      });
    } catch (error) {
      return reply.error({
        message: error.message || "Database is not connected",
        statusCode: error.statusCode || 503,
        data: getDbStatus(),
      });
    }
  });
}

module.exports = healthRoutes;
