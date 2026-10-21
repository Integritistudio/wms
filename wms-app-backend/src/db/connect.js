const mongoose = require("mongoose");
const dns = require("dns");
const env = require("../config/env");
const logger = require("../config/logger");
const { diagnose, errorDetails, targetFromUri } = require("./diagnostics");

const PUBLIC_DNS = ["8.8.8.8", "1.1.1.1"];

dns.setDefaultResultOrder("ipv4first");
dns.setServers(PUBLIC_DNS);

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
let retryTimer = null;
let connectionAttempt = null;
let attemptNumber = 0;
let lastDiagnosticsAt = 0;

function isConnected() {
  return mongoose.connection.readyState === 1;
}

function getDbStatus() {
  const readyState = mongoose.connection.readyState;
  return {
    connected: readyState === 1,
    status: CONNECTION_STATES[readyState] || "unknown",
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
}

function isSrvLookupError(error) {
  return error?.syscall === "querySrv" || String(error?.message || "").startsWith("querySrv ");
}

function bindConnectionEvents() {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on("connected", () => {
    hasConnected = true;
    logger.info({ host: mongoose.connection.host, database: mongoose.connection.name }, "MongoDB connected");
  });

  mongoose.connection.on("error", (error) => {
    if (isSrvLookupError(error)) return;
    logger.error({ error: errorDetails(error), hint: hintFor(error) }, "MongoDB connection error");
  });

  mongoose.connection.on("disconnected", () => {
    if (hasConnected) {
      logger.warn("MongoDB disconnected");
    }
  });
}

function connectOptions() {
  return {
    family: 4,
    tls: true,
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000,
    bufferCommands: false,
  };
}

async function connectOnce() {
  if (connectionAttempt) return connectionAttempt;
  connectionAttempt = performConnection();
  try {
    return await connectionAttempt;
  } finally {
    connectionAttempt = null;
  }
}

async function performConnection() {
  const attempt = ++attemptNumber;
  const started = Date.now();
  mongoose.set("strictQuery", true);
  mongoose.set("runValidators", true);
  mongoose.set("bufferCommands", false);
  bindConnectionEvents();
  try {
    logger.info({ attempt, target: targetFromUri(env.mongodbUri), options: connectOptions() }, "MongoDB connection attempt starting");
    await mongoose.connect(buildMongoUri(), connectOptions());
    logger.info({ attempt, durationMs: Date.now() - started }, "MongoDB connection attempt succeeded");
  } catch (error) {
    const topology = error.reason || error.cause;
    const servers = topology?.servers instanceof Map
      ? Array.from(topology.servers.values()).map((server) => ({
        address: server.address, type: server.type,
        error: server.error ? errorDetails(server.error) : null,
      })) : [];
    logger.error({ attempt, durationMs: Date.now() - started,
      error: errorDetails(error), cause: error.cause ? errorDetails(error.cause) : null,
      topology: topology?.type, servers, hint: hintFor(error),
    }, "MongoDB connection failed: diagnostic summary");
    // Run bounded probes in the background, at most once per minute.
    if (!lastDiagnosticsAt || Date.now() - lastDiagnosticsAt >= 60000) {
      lastDiagnosticsAt = Date.now();
      void diagnose(env.mongodbUri, logger);
    }
    throw error;
  }
}

function hintFor(error) {
  const msg = String(error?.message || error || "");
  if (/tlsv1 alert internal error|SSL alert number 80|ECONNRESET/i.test(msg)) {
    return "Connection reset or TLS failure. Check Atlas IP access, certificate trust, system clock, and network interception; see node connectivity diagnostics.";
  }
  if (/querySrv|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return "Could not reach Atlas DNS/hosts. Check internet, VPN, or firewall.";
  }
  if (/authentication failed/i.test(msg)) {
    return "MongoDB username or password is wrong.";
  }
  if (/timed out|ETIMEDOUT|server selection|ReplicaSetNoPrimary/i.test(msg)) {
    return "No usable MongoDB server responded in time. Check Atlas cluster availability, this server's outbound IP in Atlas Network Access, outbound TCP 27017, and TLS. See node connectivity diagnostics; this error alone does not identify which check failed.";
  }
  return "See the connection diagnostic summary for the error code and per-node failures.";
}

async function connectDb() {
  await connectOnce();
}

function startReconnectLoop() {
  if (retryTimer || isConnected()) return;
  logger.warn("MongoDB not connected — retrying every 8s. API will return 503 until it connects.");
  retryTimer = setInterval(() => {
    if (connectionAttempt) return;
    if (isConnected()) {
      clearInterval(retryTimer);
      retryTimer = null;
      return;
    }
    connectOnce().catch((error) => {
      logger.error({ error: errorDetails(error), hint: hintFor(error) }, "MongoDB reconnect failed");
    });
  }, 8000);
}

async function pingDb() {
  if (!isConnected() || !mongoose.connection.db) {
    const error = new Error("MongoDB is not connected");
    error.statusCode = 503;
    throw error;
  }
  await mongoose.connection.db.admin().command({ ping: 1 });
  return getDbStatus();
}

async function disconnectDb() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectDb,
  disconnectDb,
  pingDb,
  getDbStatus,
  isConnected,
  startReconnectLoop,
  hintFor,
};
