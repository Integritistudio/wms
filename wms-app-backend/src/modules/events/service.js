const crypto = require("crypto");
const WebhookEvent = require("./model");

function fingerprint({ webhookId, topic, shopDomain, rawBody }) {
  if (webhookId) {
    return String(webhookId);
  }
  return crypto
    .createHash("sha256")
    .update(`${topic || ""}:${shopDomain || ""}:${rawBody || ""}`)
    .digest("hex");
}

async function persist({ webhookId, topic, shopDomain, payload, rawBody }) {
  const id = fingerprint({ webhookId, topic, shopDomain, rawBody });
  try {
    const event = await WebhookEvent.create({
      webhookId: id,
      topic: topic || "unknown",
      shopDomain: shopDomain || "",
      payload: payload || {},
      status: "received",
    });
    return { event, duplicate: false };
  } catch (error) {
    if (error.code === 11000) {
      const event = await WebhookEvent.findOne({ webhookId: id });
      return { event, duplicate: true };
    }
    throw error;
  }
}

async function markProcessed(event) {
  event.status = "processed";
  event.error = "";
  event.processedAt = new Date();
  await event.save();
  return event;
}

async function markIgnored(event, reason = "") {
  event.status = "ignored";
  event.error = reason;
  event.processedAt = new Date();
  await event.save();
  return event;
}

async function markFailed(event, error) {
  event.status = "failed";
  event.error = error?.message || String(error);
  event.processedAt = new Date();
  await event.save();
  return event;
}

async function getById(id) {
  const event = await WebhookEvent.findById(id);
  if (!event) {
    const error = new Error("Webhook event not found");
    error.statusCode = 404;
    throw error;
  }
  return event;
}

async function listByShopDomain(shopDomain) {
  const rows = await WebhookEvent.find({ shopDomain }).sort({ createdAt: -1 }).limit(100);
  return rows.map((row) => row.toPublic());
}

module.exports = {
  persist,
  markProcessed,
  markIgnored,
  markFailed,
  getById,
  listByShopDomain,
};
