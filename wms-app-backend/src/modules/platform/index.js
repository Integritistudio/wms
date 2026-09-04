const routes = require("./routes");
const service = require("./service");

module.exports = {
  routes,
  seedPlatformAdmin: service.seedPlatformAdmin,
  startRetentionScheduler: service.startRetentionScheduler,
  runRetentionCleanup: service.runRetentionCleanup,
  areWebhooksEnabled: service.areWebhooksEnabled,
  getSettings: service.getSettings,
  getOrCreateSettings: service.getOrCreateSettings,
};
