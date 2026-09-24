const crypto = require("crypto");
const { Readable } = require("stream");
const ModernwmsWebhookEvent = require("./webhookEventModel");
const Warehouse = require("../companies/warehouseModel");
const { decrypt } = require("../../utils/secret");
const logger = require("../../config/logger");
const queue = require("../queue");
const routing = require("../routing");

const TOPIC = "modernwms.inventory.quantity_changed";

function needsRawBody(url) {
  const path = String(url || "").split("?")[0];
  return /\/modernwms\/webhooks\//.test(path);
}

function verifySignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(String(signatureHeader));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function persistEvent({ deliveryId, warehouseId, companyId, topic, payload }) {
  const id = String(deliveryId || crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex"));
  try {
    const event = await ModernwmsWebhookEvent.create({
      deliveryId: id,
      warehouseId,
      companyId,
      topic: topic || TOPIC,
      payload: payload || {},
      status: "received",
    });
    return { event, duplicate: false };
  } catch (error) {
    if (error.code === 11000) {
      const event = await ModernwmsWebhookEvent.findOne({ deliveryId: id });
      return { event, duplicate: true };
    }
    throw error;
  }
}

async function handleWebhook(request, reply) {
  const warehouseId = request.params.warehouseId;
  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse || warehouse.fulfillmentMode !== "modernwms") {
    return reply.error({ message: "Unknown warehouse webhook endpoint", statusCode: 404 });
  }

  let secret = "";
  try {
    secret = warehouse.modernwms?.webhookSecretEncrypted
      ? decrypt(warehouse.modernwms.webhookSecretEncrypted)
      : "";
  } catch {
    secret = "";
  }
  if (!secret) {
    return reply.error({ message: "Webhook secret not configured", statusCode: 401 });
  }

  const rawBody = request.rawBody;
  const signature = request.headers["x-wms-signature"];
  if (!verifySignature(rawBody, signature, secret)) {
    return reply.error({ message: "Invalid webhook signature", statusCode: 401 });
  }

  let payload = {};
  try {
    payload =
      typeof request.body === "object" && request.body
        ? request.body
        : JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    logger.warn({ err: error }, "ModernWMS webhook JSON parse failed");
  }

  const deliveryId =
    request.headers["x-wms-delivery-id"] ||
    payload.idempotency_key ||
    payload.idempotencyKey;

  const stored = await persistEvent({
    deliveryId,
    warehouseId: warehouse._id,
    companyId: warehouse.companyId,
    topic: request.headers["x-wms-event"] || payload.event || TOPIC,
    payload,
  });

  if (stored.duplicate) {
    return reply.success({ message: "Duplicate" });
  }

  const sku = String(payload.sku_code || payload.skuCode || "").trim() || "unknown";
  await queue.enqueue({
    groupId: `${warehouse._id}:${sku}`,
    topic: TOPIC,
    eventId: stored.event._id,
  });

  return reply.success({ message: "Accepted" });
}

async function processWebhookEvent(eventId) {
  const event = await ModernwmsWebhookEvent.findById(eventId);
  if (!event) {
    throw new Error("ModernWMS webhook event not found");
  }

  try {
    const payload = event.payload || {};
    const sku = String(payload.sku_code || payload.skuCode || "").trim();
    if (!sku) {
      event.status = "ignored";
      event.error = "missing sku_code";
      event.processedAt = new Date();
      await event.save();
      return;
    }

    const onHand = Math.max(
      0,
      Number(payload.qty_available ?? payload.qtyAvailable ?? payload.qty ?? 0)
    );

    await routing.upsertInventory(event.companyId, event.warehouseId, [
      { sku, quantityOnHand: onHand },
    ]);

    try {
      const inventorySync = require("../inventorySync");
      inventorySync.schedulePushSku({
        companyId: event.companyId,
        warehouseId: event.warehouseId,
        sku,
      });
    } catch (pushErr) {
      logger.warn({ err: pushErr, sku }, "Shopify inventory push schedule failed");
    }

    event.status = "processed";
    event.error = "";
    event.processedAt = new Date();
    await event.save();
  } catch (error) {
    event.status = "failed";
    event.error = error.message || String(error);
    event.processedAt = new Date();
    await event.save();
    throw error;
  }
}

async function webhookRoutes(app) {
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!needsRawBody(request.url)) {
      return payload;
    }
    const chunks = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    request.rawBody = buf;
    return Readable.from(buf);
  });

  app.post("/modernwms/webhooks/:warehouseId", {
    schema: { tags: ["ModernWMS"] },
  }, handleWebhook);
}

module.exports = {
  webhookRoutes,
  handleWebhook,
  processWebhookEvent,
  verifySignature,
  TOPIC,
};
