const path = require("path");
const SftpClient = require("ssh2-sftp-client");
const { decrypt } = require("../../utils/secret");
const logger = require("../../config/logger");

function sftpOptions(connection) {
  return {
    host: connection.host,
    port: Number(connection.port || 22),
    username: connection.username,
    password: decrypt(connection.passwordEncrypted),
    readyTimeout: 12000,
  };
}

async function testConnection(connection) {
  if (!connection?.host || !connection?.username) {
    const error = new Error("SFTP host and username are required");
    error.statusCode = 400;
    throw error;
  }

  const client = new SftpClient();
  try {
    await client.connect(sftpOptions(connection));
    return { ok: true };
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverWithConnection(connection, { body, fileName }) {
  if (!connection?.enabled || !connection.host) {
    return { status: "skipped" };
  }

  const remoteDir = (connection.remotePath || "/").replace(/\\/g, "/");
  const remotePath = path.posix.join(remoteDir, fileName);
  const delays = [1000, 4000, 16000];
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const client = new SftpClient();
    try {
      await client.connect(sftpOptions(connection));
      const dir = path.posix.dirname(remotePath);
      if (dir && dir !== ".") {
        await client.mkdir(dir, true);
      }
      await client.put(Buffer.from(body), remotePath);
      logger.info(
        { connectionId: String(connection._id), remotePath, attempt },
        "940 sent over SFTP"
      );
      return { status: "sent", remotePath };
    } catch (error) {
      lastError = error;
      logger.warn(
        { err: error, connectionId: String(connection._id), attempt },
        "SFTP delivery attempt failed"
      );
      if (attempt < 2) {
        await sleep(delays[attempt]);
      }
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  logger.error(
    { connectionId: String(connection._id), remotePath },
    "SFTP delivery failed after 3 attempts"
  );
  return { status: "failed", error: lastError?.message || "SFTP delivery failed" };
}

module.exports = {
  testConnection,
  deliverWithConnection,
};
