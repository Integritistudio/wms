const mongoose = require("mongoose");
const dns = require("dns");
const env = require("../config/env");
const logger = require("../config/logger");

const PUBLIC_DNS_SERVERS = ["8.8.8.8", "1.1.1.1"];

dns.setDefaultResultOrder("ipv4first");
dns.setServers(PUBLIC_DNS_SERVERS);

const CONNECTION_STATES = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

function buildMongoUri() {
  const encodedUser = encodeURIComponent(env.mongodbUsername);
  const encodedPass = encodeURIComponent(env.mongodbPassword);

  return env.mongodbUri.replace(
    /^(mongodb(?:\+srv)?:\/\/)(?:[^@/]+@)?/,
    `$1${encodedUser}:${encodedPass}@`
  );
}

let listenersBound = false;
let hasConnected = false;

function getDbStatus() {
  const readyState = mongoose.connection.readyState;

  return {
    connected: readyState === 1,
    status: CONNECTION_STATES[readyState] || "unknown",
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
}

function bindConnectionEvents() {
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  mongoose.connection.on("connected", () => {
    hasConnected = true;
    logger.info({ host: mongoose.connection.host }, "MongoDB connected");
  });

  mongoose.connection.on("error", (error) => {
    if (isSrvLookupError(error)) {
      return;
    }

    logger.error({ err: error }, "MongoDB connection error");
  });

  mongoose.connection.on("disconnected", () => {
    if (hasConnected) {
      logger.warn("MongoDB disconnected");
    }
  });
}

function isSrvLookupError(error) {
  return error?.syscall === "querySrv" || String(error?.message || "").startsWith("querySrv ");
}

async function connectDb() {
  mongoose.set("strictQuery", true);
  mongoose.set("runValidators", true);
  bindConnectionEvents();

  await mongoose.connect(buildMongoUri(), {
    family: 4,
    serverSelectionTimeoutMS: 15000,
  });
}

async function pingDb() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    const error = new Error("MongoDB is not connected");
    error.statusCode = 503;
    throw error;
  }

  await mongoose.connection.db.admin().command({ ping: 1 });
  return getDbStatus();
}

async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectDb,
  disconnectDb,
  pingDb,
  getDbStatus,
};
