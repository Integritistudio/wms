const routes = require("./routes");
const service = require("./service");

module.exports = {
  routes,
  seedPlatformAdmin: service.seedPlatformAdmin,
};
