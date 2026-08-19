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

async function deliverWithConnection(connection, { body, fileName }) {
  if (!connection?.enabled || !connection.host) {
    return { status: "skipped" };
  }

  const client = new SftpClient();
  const remoteDir = (connection.remotePath || "/").replace(/\\/g, "/");
  const remotePath = path.posix.join(remoteDir, fileName);

  try {
    await client.connect(sftpOptions(connection));
    const dir = path.posix.dirname(remotePath);
    if (dir && dir !== ".") {
      await client.mkdir(dir, true);
    }
    await client.put(Buffer.from(body), remotePath);
    logger.info(
      { connectionId: String(connection._id), remotePath },
      "940 sent over SFTP"
    );
    return { status: "sent", remotePath };
  } catch (error) {
    logger.warn(
      { err: error, connectionId: String(connection._id) },
      "940 SFTP delivery failed"
    );
    return { status: "failed", error: error.message };
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

module.exports = {
  testConnection,
  deliverWithConnection,
};
