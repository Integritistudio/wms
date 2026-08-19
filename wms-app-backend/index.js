const env = require("./src/config/env");
const logger = require("./src/config/logger");
const buildApp = require("./src/app");
const { connectDb, disconnectDb } = require("./src/db/connect");
const { seedDefaultCompanyRoot } = require("./src/db/seed");
const { seedCountriesAndStates } = require("./src/db/seedLocations");
const { seedPlatformAdmin } = require("./src/modules/platform");
const { seedGenericMapping } = require("./src/modules/edi");

async function start() {
  const app = await buildApp();

  try {
    await connectDb();
  } catch (error) {
    logger.error(error, "Failed to connect to MongoDB");
    if (env.isProduction) {
      process.exit(1);
    }
  }

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

  try {
    await app.listen({ port: env.port, host: env.host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  const shutdown = async () => {
    logger.info("Shutting down");
    await disconnectDb();
    await app.close();
    logger.flush();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start();
