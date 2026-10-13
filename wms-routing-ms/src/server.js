require("dotenv").config();
const mongoose = require("mongoose");
const { buildApp } = require("./app");

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI required");
  const app = buildApp({ secret: process.env.ROUTING_MS_SECRET,
    Rule: require("./ruleModel"), Config: require("./configModel"),
    ready: () => mongoose.connection.readyState === 1,
    logger: { level: process.env.LOG_LEVEL || "info" },
  });
  mongoose.set("bufferCommands", false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([require("./ruleModel").init(), require("./configModel").init()]);
  app.addHook("onClose", () => mongoose.disconnect());
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
  await app.listen({ host: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 8723) });
}

main().catch(async () => {
  await mongoose.disconnect();
  console.error("Routing service failed to start; check database and service configuration.");
  process.exitCode = 1;
});
