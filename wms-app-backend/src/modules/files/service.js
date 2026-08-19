const bcrypt = require("bcrypt");
const env = require("../../config/env");
const { randomToken } = require("../../utils/secret");
const { httpError } = require("../../utils/httpError");
const FileLink = require("./model");
const storage = require("./storage");
const mail = require("./mail");

async function storeAndLink({
  body,
  fileName,
  contentType = "text/plain",
  password,
  expiresInDays = 30,
  orderId,
  documentId,
}) {
  const storageKey = `edi/${Date.now()}-${randomToken(8)}-${fileName}`;
  await storage.putObject(storageKey, body, contentType);

  const token = randomToken(24);
  const passwordHash = password ? await bcrypt.hash(String(password), 10) : null;
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const link = await FileLink.create({
    token,
    storageKey,
    fileName,
    contentType,
    passwordHash,
    expiresAt,
    orderId: orderId || null,
    documentId: documentId || null,
  });

  return link.toPublic(env.publicApiUrl);
}

async function findByToken(token) {
  const link = await FileLink.findOne({ token });
  if (!link) {
    throw httpError(404, "File not found");
  }

  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    throw httpError(410, "Link expired");
  }

  return link;
}

async function unlock(token, password) {
  const link = await findByToken(token);

  if (link.passwordHash) {
    const ok = password && (await bcrypt.compare(String(password), link.passwordHash));
    if (!ok) {
      throw httpError(401, "Password required");
    }
  }

  link.downloadCount += 1;
  await link.save();

  const body = await storage.getObject(link.storageKey);
  return { link, body };
}

async function emailLink({ token, to, subject }) {
  const link = await findByToken(token);
  return mail.sendDownloadLink({
    to,
    subject,
    url: `${env.publicApiUrl}/files/${link.token}`,
    passwordRequired: Boolean(link.passwordHash),
  });
}

module.exports = {
  storeAndLink,
  findByToken,
  unlock,
  emailLink,
};
