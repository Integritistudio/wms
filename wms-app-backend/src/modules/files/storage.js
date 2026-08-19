const fs = require("fs/promises");
const path = require("path");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const env = require("../../config/env");
const logger = require("../../config/logger");

let s3Client = null;

function getS3() {
  if (!env.r2Configured) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }

  return s3Client;
}

async function putObject(storageKey, body, contentType = "text/plain") {
  const client = getS3();

  if (client) {
    await client.send(
      new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: storageKey,
        Body: body,
        ContentType: contentType,
      })
    );
    return { driver: "r2", storageKey };
  }

  const filePath = path.join(env.fileStorageDir, storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  logger.debug({ storageKey }, "Stored file on local disk");
  return { driver: "local", storageKey };
}

async function getObject(storageKey) {
  const client = getS3();

  if (client) {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: env.r2Bucket,
        Key: storageKey,
      })
    );
    return Buffer.from(await result.Body.transformToByteArray());
  }

  const filePath = path.join(env.fileStorageDir, storageKey);
  return fs.readFile(filePath);
}

module.exports = {
  putObject,
  getObject,
};
