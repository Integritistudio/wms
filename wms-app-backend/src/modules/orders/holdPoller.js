const logger = require("../../config/logger");
const { isConnected } = require("../../db/connect");

let running = false;
let timer = null;

const DEFAULT_INTERVAL_MS = 20_000;

async function releaseDueHolds(limit = 25) {
  const Order = require("./model");
  const shops = require("../shops");
  const fulfillment = require("../fulfillment");

  const due = await Order.find({
    wmsPushDeferred: true,
    wmsPushHoldUntil: { $lte: new Date() },
    status: { $nin: ["cancelled", "fulfilled", "partially_fulfilled", "returned", "partially_returned"] },
  })
    .sort({ wmsPushHoldUntil: 1 })
    .limit(limit);

  let released = 0;
  for (const order of due) {
    try {
      const shop = await shops.getById(order.shopId);
      if (!shop) {
        order.wmsPushDeferred = false;
        order.wmsPushHoldUntil = null;
        order.lastError = "Shop missing for deferred WMS push";
        await order.save();
        continue;
      }
      const result = await fulfillment.pushAllocatedOrder({ order, shop });
      if (!result.skipped) released += 1;
    } catch (error) {
      logger.error(
        { err: error, orderId: String(order._id) },
        "Failed to release deferred WMS push"
      );
      try {
        order.lastError = error.message || "Deferred WMS push failed";
        await order.save();
      } catch {
        /* ignore */
      }
    }
  }
  return released;
}

function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (running) return;
  running = true;
  logger.info({ intervalMs }, "WMS push hold poller started");

  async function tick() {
    if (!running) return;
    if (!isConnected()) {
      timer = setTimeout(tick, intervalMs);
      return;
    }
    try {
      const count = await releaseDueHolds();
      if (count > 0) {
        logger.info({ count }, "WMS push hold poller released orders");
      }
    } catch (error) {
      logger.error({ err: error }, "WMS push hold poller tick error");
    }
    timer = setTimeout(tick, intervalMs);
  }

  tick();
}

function stop() {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  logger.info("WMS push hold poller stopped");
}

module.exports = { start, stop, releaseDueHolds };
