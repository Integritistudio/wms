const routes = require("./routes");
const service = require("./service");

module.exports = {
  routes,
  fulfillOrder: service.fulfillOrder,
  replayEvent: service.replayEvent,
  listEvents: service.listEvents,
};
