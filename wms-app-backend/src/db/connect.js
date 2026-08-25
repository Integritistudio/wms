const mongoose = require("mongoose");
const dns = require("dns");
const env = require("../config/env");
const logger = require("../config/logger");

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
    logger.info({ host: mongoose.connection.host }, "MongoDB connected");
  });

  mongoose.connection.on("error", (error) => {
    if (isSrvLookupError(error)) return;
    logger.error({ err: error }, "MongoDB connection error");
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
  mongoose.set("strictQuery", true);
  mongoose.set("runValidators", true);
  mongoose.set("bufferCommands", false);
  bindConnectionEvents();
  await mongoose.connect(buildMongoUri(), connectOptions());
}

function hintFor(error) {
  const msg = String(error?.message || error || "");
  if (/tlsv1 alert internal error|SSL alert number 80|ECONNRESET/i.test(msg)) {
    return "Atlas closed the TLS handshake. Check Network Access (allow this machine's IP, or 0.0.0.0/0 for dev) and that nothing is intercepting HTTPS.";
  }
  if (/querySrv|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return "Could not reach Atlas DNS/hosts. Check internet, VPN, or firewall.";
  }
  if (/authentication failed/i.test(msg)) {
    return "MongoDB username or password is wrong.";
  }
  return "";
}

async function connectDb() {
  await connectOnce();
}

function startReconnectLoop() {
  if (retryTimer || isConnected()) return;
  logger.warn("MongoDB not connected — retrying every 8s. API will return 503 until it connects.");
  retryTimer = setInterval(() => {
    if (isConnected()) {
      clearInterval(retryTimer);
      retryTimer = null;
      return;
    }
    connectOnce().catch((error) => {
      logger.error({ err: error, hint: hintFor(error) }, "MongoDB reconnect failed");
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
