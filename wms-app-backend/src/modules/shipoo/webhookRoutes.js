const { Readable } = require("stream");
const ShipooTrackingSettings = require("./model");
const service = require("./service");
const logger = require("../../config/logger");

function needsRawBody(url) {
  const path = String(url || "").split("?")[0];
  return /\/webhooks\/shipoo\//.test(path);
}

async function handleTrackingWebhook(request, reply) {
  const rawBody = request.rawBody;
  const timestamp = request.headers["x-webhook-timestamp"];
  const signature = request.headers["x-webhook-signature"];
  const eventId = request.headers["x-webhook-id"] || "";

  let payload = {};
  try {
    payload =
      typeof request.body === "object" && request.body
        ? request.body
        : JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "{}"));
  } catch (err) {
    logger.warn({ err }, "Shipoo webhook JSON parse failed");
    return reply.error({ message: "Invalid JSON", statusCode: 400 });
  }

  const data = payload.data || {};
  const externalShipmentId = String(data.externalShipmentId || "").trim();
  if (!externalShipmentId) {
    return reply.error({ message: "Missing externalShipmentId", statusCode: 400 });
  }

  const Shipment = require("../fulfillment/shipmentModel");
  const shipment = await Shipment.findById(externalShipmentId);
  if (!shipment) {
    return reply.error({ message: "Shipment not found", statusCode: 404 });
  }

  const settings = await ShipooTrackingSettings.findOne({ companyId: shipment.companyId });
  if (!settings?.enabled) {
    return reply.success({ message: "Auto-tracking disabled", data: { ignored: true } });
  }

  const secret = await service.resolveWebhookSecret(settings);
  if (!secret) {
    return reply.error({ message: "Webhook secret not configured", statusCode: 401 });
  }

  if (!service.verifyWebhookSignature(rawBody, timestamp, signature, secret)) {
    return reply.error({ message: "Invalid webhook signature", statusCode: 401 });
  }

  try {
    const result = await service.applyTrackingWebhook({
      eventId: eventId || payload.id,
      eventType: payload.type,
      data,
    });
    return reply.success({ message: "Accepted", data: result });
  } catch (err) {
    logger.warn({ err, externalShipmentId }, "Shipoo webhook apply failed");
    throw err;
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

  app.post("/webhooks/shipoo/tracking", {
    schema: { tags: ["Shipoo"] },
  }, handleTrackingWebhook);
}

module.exports = {
  webhookRoutes,
  handleTrackingWebhook,
  needsRawBody,
};
