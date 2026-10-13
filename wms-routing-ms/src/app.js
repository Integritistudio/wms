const Fastify = require("fastify");
const { authenticate } = require("./auth");
const { createRoutingService } = require("./service");
const { createMapbox } = require("./mapbox");

function buildApp({ secret, Rule, Config, ready = () => true, logger = false, mapbox, bodyLimit = 8 * 1024 * 1024 } = {}) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("ROUTING_MS_SECRET must be at least 32 characters");
  const app = Fastify({ logger, bodyLimit, requestTimeout: 30000 });
  // Authenticate the exact bytes, not reserialized JSON.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    request.rawBody = body;
    try { done(null, JSON.parse(body)); } catch { done(Object.assign(new Error("Invalid JSON"), { statusCode: 400 })); }
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => ready() ? { status: "ready" } : reply.code(503).send({ status: "not_ready" }));
  const service = createRoutingService({ Rule, Config, mapbox: mapbox || createMapbox({ token: process.env.MAPBOX_TOKEN, logger: app.log }) });
  app.register(async (api) => {
    api.addHook("preHandler", async (request) => {
      request.companyId = authenticate(request, secret);
      if (!ready()) throw Object.assign(new Error("Routing database unavailable"), { statusCode: 503 });
    });
    const objectBody = (request) => {
      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
        throw Object.assign(new Error("JSON object required"), { statusCode: 400 });
      }
      return request.body;
    };
    const input = (request) => {
      const body = objectBody(request);
      if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
        throw Object.assign(new Error("data object required"), { statusCode: 400 });
      }
      return body;
    };
    api.get("/config", (request) => service.getConfig(request.companyId));
    api.put("/config", (request) => { const body = input(request); return service.saveConfig(request.companyId, body.data, body.snapshot); });
    api.get("/rules", (request) => service.listRules(request.companyId));
    api.post("/rules", async (request, reply) => { const body = input(request); reply.code(201); return service.createRule(request.companyId, body.data, body.snapshot); });
    api.put("/rules/:id", (request) => { const body = input(request); return service.updateRule(request.companyId, request.params.id, body.data, body.snapshot); });
    api.delete("/rules/:id", (request) => service.deleteRule(request.companyId, request.params.id));
    api.post("/rules/reorder", (request) => service.reorderRules(request.companyId, objectBody(request).orderedIds));
    api.post("/resolve", (request) => { const body = objectBody(request); return service.decide(request.companyId, body.order, body.snapshot); });
    api.post("/test", (request) => { const body = objectBody(request); return service.decide(request.companyId, body.order, body.snapshot, true); });
  }, { prefix: "/v1/routing" });
  app.setErrorHandler((err, _request, reply) => {
    const status = err.name === "ValidationError" || err.name === "CastError" ? 400 : err.statusCode || (err.code === 11000 ? 409 : 500);
    if (status >= 500) app.log.error({ err }, "Routing request failed");
    reply.code(status).send({ message: status >= 500 ? "Routing service unavailable" : err.message });
  });
  return app;
}

module.exports = { buildApp };
