const Fastify = require("fastify");
const swagger = require("@fastify/swagger");
const multipart = require("@fastify/multipart");
const formbody = require("@fastify/formbody");
const env = require("./config/env");
const logger = require("./config/logger");
const { sendSuccess, sendError } = require("./utils/response");
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const companyUserRoutes = require("./routes/companyUsers");
const locationRoutes = require("./routes/locations");
const companyProfileRoutes = require("./routes/companyProfile");
const platform = require("./modules/platform");
const companies = require("./modules/companies");
const shops = require("./modules/shops");
const shopify = require("./modules/shopify");
const orders = require("./modules/orders");
const files = require("./modules/files");
const uploaders = require("./modules/uploaders");

async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
  });

  app.decorateReply("success", function success(options) {
    return sendSuccess(this, options);
  });

  app.decorateReply("error", function error(options) {
    return sendError(this, options);
  });

  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", env.corsOrigin);
    reply.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    reply.header("X-Content-Type-Options", "nosniff");

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }

    const path = request.url.split("?")[0];
    if (
      path === "/health" ||
      path === "/health/db" ||
      path === "/docs" ||
      path.startsWith("/docs/")
    ) {
      return;
    }

    const { isConnected } = require("./db/connect");
    if (!isConnected()) {
      return reply.error({
        message:
          "Database is not connected. Wait for MongoDB Atlas, then retry.",
        statusCode: 503,
      });
    }
  });

  await app.register(formbody);
  await app.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024,
    },
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "WMS Linker API",
        description: "Shopify to 3PL translator",
        version: "1.0.0",
      },
      tags: [
        { name: "Health", description: "Server and database health checks" },
        { name: "Auth", description: "Company login and registration" },
        { name: "Company Users", description: "Users belonging to a company" },
        { name: "Locations", description: "Countries and states" },
        { name: "Company Profile", description: "Company profile details" },
        { name: "Platform", description: "Platform admin" },
        {
          name: "Companies",
          description: "Platform companies, stores, and warehouses",
        },
        { name: "Shopify", description: "OAuth and webhooks" },
        {
          name: "Orders",
          description: "Canonical orders, EDI 940/945, and demo simulation",
        },
        { name: "Uploaders", description: "Warehouse 945 uploaders" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  const scalar = await import("@scalar/fastify-api-reference");
  await app.register(scalar.default, {
    routePrefix: "/docs",
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.error({
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error.validation) {
      return reply.error({
        message: "Validation failed",
        statusCode: 400,
        errors: error.validation,
      });
    }

    if (error.name === "ValidationError") {
      return reply.error({
        message: "Validation failed",
        statusCode: 400,
        errors: Object.values(error.errors).map((item) => item.message),
      });
    }

    if (error.name === "CastError") {
      return reply.error({
        message: "Invalid id",
        statusCode: 400,
      });
    }

    if (error.code === 11000) {
      return reply.error({
        message: "Already exists",
        statusCode: 409,
      });
    }

    if (error.name === "ZodError") {
      return reply.error({
        message: "Validation failed",
        statusCode: 400,
        errors: error.issues,
      });
    }

    return reply.error({
      message: error.message || "Internal server error",
      statusCode:
        /buffering timed out|MongoServerSelectionError|not connected/i.test(
          error.message || "",
        )
          ? 503
          : error.statusCode || 500,
      errors: error.errors || null,
    });
  });

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(companyUserRoutes, { prefix: "/api" });
  await app.register(locationRoutes, { prefix: "/api" });
  await app.register(companyProfileRoutes, { prefix: "/api" });
  await app.register(platform.routes, { prefix: "/api" });
  await app.register(companies.routes, { prefix: "/api" });
  await app.register(shops.routes, { prefix: "/api" });
  await app.register(shopify.routes, { prefix: "/api" });
  await app.register(orders.routes, { prefix: "/api" });
  await app.register(files.routes, { prefix: "/api" });
  await app.register(uploaders.routes, { prefix: "/api" });

  return app;
}

module.exports = buildApp;
