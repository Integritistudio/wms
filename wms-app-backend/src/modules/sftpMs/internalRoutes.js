const env = require("../../config/env");
const logger = require("../../config/logger");
const { timingSafeEqual } = require("node:crypto");

function assertSecret(request, reply) {
  const expected = String(env.sftpMsCallbackSecret || "");
  const provided = String(request.headers["x-sftp-ms-secret"] || "");
  if (!expected) {
    reply.code(503).send({ message: "SFTP-ms callback is not configured" });
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    reply.code(401).send({ message: "Unauthorized" });
    return false;
  }
  return true;
}

async function internalRoutes(app) {
  app.post("/internal/sftp-ms/inbound", {
    schema: { tags: ["Internal"], hide: true },
  }, async (request, reply) => {
    if (!assertSecret(request, reply)) return;
    const { fileName, body, documentType, bodyHash } = request.body || {};
    logger.info(
      { fileName, documentType, bodyHash, bytes: String(body || "").length },
      "SFTP-ms inbound file received",
    );
    // Full 945 order matching can be wired into edi.ingest945 here.
    return reply.send({ ok: true, accepted: true });
  });
}

module.exports = { internalRoutes };
