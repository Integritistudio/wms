const env = require("../../config/env");
const logger = require("../../config/logger");
const { isConnected } = require("../../db/connect");

let running = false;
let timer = null;

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
