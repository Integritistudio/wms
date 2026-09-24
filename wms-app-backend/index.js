const env = require("./src/config/env");
const logger = require("./src/config/logger");
const buildApp = require("./src/app");
const { connectDb, disconnectDb, isConnected, startReconnectLoop, hintFor } = require("./src/db/connect");
const { seedDefaultCompanyRoot } = require("./src/db/seed");
const { seedCountriesAndStates } = require("./src/db/seedLocations");
const { seedPlatformAdmin } = require("./src/modules/platform");
const { seedGenericMapping } = require("./src/modules/edi");

async function start() {
  const app = await buildApp();

  try {
    await connectDb();
  } catch (error) {
    logger.error({ err: error, hint: hintFor(error) }, "Failed to connect to MongoDB");
    if (env.isProduction) {
      process.exit(1);
    }
    startReconnectLoop();
  }

  if (isConnected()) {
    try {
      await seedCountriesAndStates();
      await seedDefaultCompanyRoot();
      await seedPlatformAdmin();
      await seedGenericMapping();
    } catch (error) {
      logger.error(error, "Failed to seed database");
      if (env.isProduction) {
        process.exit(1);
      }
    }
  } else {
    logger.warn("Skipping database seed until MongoDB connects");
  }

  try {
    await app.listen({ port: env.port, host: env.host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  const queue = require("./src/modules/queue");
  const { processEvent } = require("./src/modules/shopify/service");
  const events = require("./src/modules/events");
  const modernwmsWebhooks = require("./src/modules/modernwms/webhookRoutes");

  function startQueue() {
    queue.start(async (job) => {
      if (String(job.topic || "").startsWith("modernwms.")) {
        await modernwmsWebhooks.processWebhookEvent(job.eventId);
        return;
      }
      const event = await events.getById(job.eventId);
      await processEvent(event);
    });
    const { startRetentionScheduler } = require("./src/modules/platform");
    startRetentionScheduler();
    const dlqAlert = require("./src/modules/orders/dlqAlert");
    dlqAlert.start();
  }

  if (isConnected()) {
    startQueue();
    const modernwmsPoller = require("./src/modules/modernwms/poller");
    modernwmsPoller.start();
  } else {
    const mongoose = require("mongoose");
    mongoose.connection.once("connected", () => {
      seedCountriesAndStates().catch((error) => logger.error(error, "Failed to seed database"));
      seedDefaultCompanyRoot().catch((error) => logger.error(error, "Failed to seed database"));
      seedPlatformAdmin().catch((error) => logger.error(error, "Failed to seed database"));
      seedGenericMapping().catch((error) => logger.error(error, "Failed to seed database"));
      startQueue();
      const modernwmsPoller = require("./src/modules/modernwms/poller");
      modernwmsPoller.start();
    });
  }

  const shutdown = async () => {
    logger.info("Shutting down");
    queue.stop();
    try {
      require("./src/modules/modernwms/poller").stop();
    } catch {
      /* ignore */
    }
    try {
      require("./src/modules/orders/dlqAlert").stop();
    } catch {
      /* ignore */
    }
    await disconnectDb();
    await app.close();
    logger.flush();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start();
