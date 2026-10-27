const env = require("../../config/env");
const logger = require("../../config/logger");
const { isConnected } = require("../../db/connect");

let running = false;
let timer = null;
let lastInventorySync = 0;

function start(intervalMs = env.modernwmsPollIntervalMs) {
  if (running) return;
  running = true;
  logger.info({ intervalMs }, "ModernWMS poller started");

  async function tick() {
    if (!running) return;
    if (!isConnected()) {
      timer = setTimeout(tick, intervalMs);
      return;
    }
    try {
      const modernwms = require("./service");
      const count = await modernwms.pollOpenLinks();
      if (count > 0) {
        logger.debug({ count }, "ModernWMS poller processed links");
      }
      if (!lastInventorySync || Date.now() - lastInventorySync >= 300000) {
        lastInventorySync = Date.now();
        const Warehouse = require("../companies/warehouseModel");
        const warehouses = await Warehouse.find({ isActive: true, fulfillmentMode: "modernwms",
          "modernwms.passwordEncrypted": { $type: "string", $ne: "" } });
        for (const warehouse of warehouses) {
          if (!running) break;
          try {
            const result = await modernwms.syncInventory(warehouse.companyId, warehouse._id);
            logger.info({ warehouseId: String(warehouse._id), synced: result.synced }, "ModernWMS inventory refreshed");
          } catch (error) {
            logger.warn({ err: error, warehouseId: String(warehouse._id) }, "ModernWMS inventory refresh failed");
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, "ModernWMS poller tick error");
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
  logger.info("ModernWMS poller stopped");
}

module.exports = { start, stop };
