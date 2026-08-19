const pino = require("pino");
const env = require("./env");

function buildTargets() {
  const targets = [];

  if (env.nodeEnv === "development") {
    targets.push({
      target: "pino-pretty",
      level: env.logLevel,
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    });
  } else {
    targets.push({
      target: "pino/file",
      level: env.logLevel,
      options: {
        destination: 1,
      },
    });
  }

  if (env.logFile) {
    targets.push({
      target: "pino/file",
      level: env.logLevel,
      options: {
        destination: env.logFile,
        mkdir: true,
      },
    });
  }

  return targets;
}

function createLogger() {
  if (env.nodeEnv === "test") {
    return pino({ level: "silent" });
  }

  return pino({
    level: env.logLevel,
    name: "wms-backend",
    base: {
      service: "wms-backend",
      env: env.nodeEnv,
    },
    redact: {
      paths: [
        "lastPassword",
        "*.lastPassword",
        "password",
        "mongodbPassword",
        "*.password",
        "*.token",
        "req.headers.authorization",
      ],
      censor: "[Redacted]",
    },
    transport: {
      targets: buildTargets(),
    },
  });
}

const logger = createLogger();

module.exports = logger;
