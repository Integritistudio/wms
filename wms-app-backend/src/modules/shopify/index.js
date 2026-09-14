const routes = require("./routes");
const service = require("./service");

module.exports = {
  routes,
  fulfillOrder: service.fulfillOrder,
  markOrderInProgress: service.markOrderInProgress,
  replayEvent: service.replayEvent,
  listEvents: service.listEvents,
  returns: require("./returns"),
};
