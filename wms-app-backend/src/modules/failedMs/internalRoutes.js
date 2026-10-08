const fulfillment = require("../fulfillment/service");
const orders = require("../orders");
const shops = require("../shops");
const env = require("../../config/env");
const logger = require("../../config/logger");
const { timingSafeEqual } = require("node:crypto");

function assertSecret(request, reply) {
  const expected = String(env.failedMsCallbackSecret || "");
  const provided = String(request.headers["x-failed-ms-secret"] || "");
  if (!expected) {
    reply.code(503).send({ message: "Failed-ms callback is not configured" });
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    reply.code(401).send({ message: "Unauthorized" });
    return false;
  }
  return true;
}

async function internalRoutes(app) {
  app.post("/internal/failed-ms/execute", {
    schema: { tags: ["Internal"], hide: true },
  }, async (request, reply) => {
    if (!assertSecret(request, reply)) return;

    const { action, orderId, warehouseId } = request.body || {};
    if (!orderId || !["retry", "reassign"].includes(action)) {
      return reply.code(400).send({ message: "action and orderId required" });
    }

    try {
      const order = await orders.getById(orderId);
      const shop = await shops.getById(order.shopId);

      if (action === "reassign") {
        if (!warehouseId) {
          return reply.code(400).send({ message: "warehouseId required for reassign" });
        }
        const data = await orders.assignWarehouse(String(orderId), warehouseId);
        return reply.send({ ok: true, data });
      }

      const result = await fulfillment.allocateOrder(order, shop, {
        forceWarehouseId: order.warehouseId ? String(order.warehouseId) : null,
      });
      if (result.failed || result.hold) {
        return reply.code(400).send({
          ok: false,
          message:
            result.order?.lastError ||
            result.order?.routingReason ||
            "Retry did not allocate the order",
        });
      }
      return reply.send({ ok: true });
    } catch (err) {
      logger.error({ err, orderId, action }, "failed-ms execute error");
      return reply.code(err.statusCode || 500).send({
        ok: false,
        message: err.message || "Execute failed",
      });
    }
  });
}

module.exports = { internalRoutes };
