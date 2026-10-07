const crypto = require("crypto");
const ShipooTrackingSettings = require("./model");
const client = require("./client");
const { encrypt, decrypt } = require("../../utils/secret");
const { httpError } = require("../../utils/httpError");
const env = require("../../config/env");
const logger = require("../../config/logger");

const SHIPMENT_FLOW = [
  "pending",
  "labeled",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return "••••";
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

function toPublic(doc) {
  if (!doc) {
    return {
      enabled: false,
      apiKeySet: false,
      webhookSecretSet: false,
      apiKeyMasked: "",
      webhookSecretMasked: "",
      destinationId: "",
      webhookUrl: webhookUrl(),
      shipooConfigured: Boolean(env.shipooBaseUrl),
      lastRegisteredAt: null,
      lastWebhookAt: null,
    };
  }
  let apiKey = "";
  let webhookSecret = "";
  try {
    apiKey = doc.apiKeyEncrypted ? decrypt(doc.apiKeyEncrypted) : "";
  } catch {
    apiKey = "";
  }
  try {
    webhookSecret = doc.webhookSecretEncrypted
      ? decrypt(doc.webhookSecretEncrypted)
      : "";
  } catch {
    webhookSecret = "";
  }
  return {
    enabled: Boolean(doc.enabled),
    apiKeySet: Boolean(apiKey),
    webhookSecretSet: Boolean(webhookSecret),
    apiKeyMasked: maskSecret(apiKey),
    webhookSecretMasked: maskSecret(webhookSecret),
    destinationId: doc.destinationId || "",
    webhookUrl: webhookUrl(),
    shipooConfigured: Boolean(env.shipooBaseUrl),
    lastRegisteredAt: doc.lastRegisteredAt || null,
    lastWebhookAt: doc.lastWebhookAt || null,
  };
}

function webhookUrl() {
  const base = String(env.publicApiUrl || "").replace(/\/+$/, "");
  return `${base}/api/webhooks/shipoo/tracking`;
}

async function getSettings(companyId) {
  const doc = await ShipooTrackingSettings.findOne({ companyId });
  return toPublic(doc);
}

async function getSettingsDoc(companyId) {
  return ShipooTrackingSettings.findOne({ companyId });
}

async function isEnabledForCompany(companyId) {
  const doc = await ShipooTrackingSettings.findOne({ companyId }).lean();
  return Boolean(doc?.enabled);
}

async function resolveApiKey(doc) {
  if (doc?.apiKeyEncrypted) {
    try {
      const key = decrypt(doc.apiKeyEncrypted);
      if (key) return key;
    } catch {
      /* fall through */
    }
  }
  return env.shipooApiKey || "";
}

async function resolveWebhookSecret(doc) {
  if (doc?.webhookSecretEncrypted) {
    try {
      const secret = decrypt(doc.webhookSecretEncrypted);
      if (secret) return secret;
    } catch {
      /* fall through */
    }
  }
  return env.shipooWebhookSecret || "";
}

async function saveSettings(companyId, payload = {}) {
  let doc = await ShipooTrackingSettings.findOne({ companyId });
  if (!doc) {
    doc = new ShipooTrackingSettings({ companyId });
  }

  if (payload.enabled !== undefined) {
    doc.enabled = Boolean(payload.enabled);
  }
  if (payload.destinationId !== undefined) {
    doc.destinationId = String(payload.destinationId || "").trim();
  }

  const nextApiKey = String(payload.apiKey || "").trim();
  if (nextApiKey && !nextApiKey.includes("…") && !nextApiKey.includes("•")) {
    doc.apiKeyEncrypted = encrypt(nextApiKey);
  }
  const nextWebhookSecret = String(payload.webhookSecret || "").trim();
  if (
    nextWebhookSecret &&
    !nextWebhookSecret.includes("…") &&
    !nextWebhookSecret.includes("•")
  ) {
    doc.webhookSecretEncrypted = encrypt(nextWebhookSecret);
  }

  if (doc.enabled) {
    const apiKey = await resolveApiKey(doc);
    if (!apiKey) {
      throw httpError(
        400,
        "Shipoo API key is required when auto-tracking is enabled",
      );
    }
    if (!env.shipooBaseUrl) {
      throw httpError(503, "Shipoo base URL is not configured on the server");
    }
  }

  await doc.save();
  return toPublic(doc);
}

function mapShipooStatus(status) {
  const raw = String(status || "")
    .trim()
    .toUpperCase();
  switch (raw) {
    case "IN_TRANSIT":
      return "in_transit";
    case "OUT_FOR_DELIVERY":
      return "out_for_delivery";
    case "DELIVERED":
      return "delivered";
    case "RETURNED":
      return "returned";
    case "EXCEPTION":
    case "FAILURE":
    case "DELIVERY_ATTEMPTED":
      return "failed";
    case "PRE_TRANSIT":
    case "UNKNOWN":
    case "CANCELLED":
    default:
      return null;
  }
}

function isForwardOrSideStatus(from, to) {
  if (!to || from === to) return false;
  if (to === "failed" || to === "returned") {
    return from !== "returned";
  }
  if (from === "delivered" && to !== "returned") return false;
  const fi = SHIPMENT_FLOW.indexOf(from);
  const ti = SHIPMENT_FLOW.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti > fi;
}

function verifyWebhookSignature(rawBody, timestampHeader, signatureHeader, secret) {
  if (!rawBody || !timestampHeader || !signatureHeader || !secret) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  const payload = `${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody)}`;
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expected = `v1=${digest}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function registerShipmentTracking(shipment, { orderId, companyId } = {}) {
  if (!shipment?.trackingNumber) return null;
  const settings = await getSettingsDoc(companyId || shipment.companyId);
  if (!settings?.enabled) return null;

  const apiKey = await resolveApiKey(settings);
  if (!apiKey) {
    logger.warn(
      { companyId: String(companyId || shipment.companyId) },
      "Shipoo enabled but API key missing; skip register",
    );
    return null;
  }

  try {
    const result = await client.registerTracking(apiKey, {
      externalShipmentId: String(shipment._id),
      carrier: String(shipment.carrier || "ups").toLowerCase(),
      trackingNumber: String(shipment.trackingNumber),
      metadata: {
        companyId: String(companyId || shipment.companyId),
        orderId: String(orderId || shipment.orderId || ""),
      },
    });

    const trackingRecordId =
      result?.id || result?.trackingRecordId || result?.data?.id || "";
    shipment.metadata = {
      ...(shipment.metadata || {}),
      shipooTrackingRecordId: trackingRecordId || undefined,
      shipooRegisteredAt: new Date().toISOString(),
    };
    await shipment.save();

    settings.lastRegisteredAt = new Date();
    await settings.save();

    logger.info(
      {
        shipmentId: String(shipment._id),
        trackingRecordId,
      },
      "Registered shipment with Shipoo",
    );
    return result;
  } catch (err) {
    logger.warn(
      { err, shipmentId: String(shipment._id) },
      "Failed to register shipment with Shipoo",
    );
    return null;
  }
}

async function applyTrackingWebhook({ eventId, eventType, data }) {
  const externalShipmentId = String(data?.externalShipmentId || "").trim();
  if (!externalShipmentId) {
    return { ok: false, reason: "missing_external_shipment_id" };
  }

  const Shipment = require("../fulfillment/shipmentModel");
  const shipment = await Shipment.findById(externalShipmentId);
  if (!shipment) {
    return { ok: false, reason: "shipment_not_found" };
  }

  const settings = await getSettingsDoc(shipment.companyId);
  if (!settings?.enabled) {
    return { ok: false, reason: "auto_tracking_disabled" };
  }

  const seen = shipment.metadata?.shipooLastEventId;
  if (eventId && seen && String(seen) === String(eventId)) {
    return { ok: true, reason: "duplicate" };
  }

  const mapped = mapShipooStatus(data?.status);
  if (!mapped) {
    shipment.metadata = {
      ...(shipment.metadata || {}),
      shipooLastEventId: eventId || shipment.metadata?.shipooLastEventId,
      shipooLastStatus: data?.status || "",
    };
    await shipment.save();
    settings.lastWebhookAt = new Date();
    await settings.save();
    return { ok: true, reason: "ignored_status", status: data?.status };
  }

  if (!isForwardOrSideStatus(shipment.status, mapped)) {
    shipment.metadata = {
      ...(shipment.metadata || {}),
      shipooLastEventId: eventId || shipment.metadata?.shipooLastEventId,
      shipooLastStatus: data?.status || "",
    };
    await shipment.save();
    settings.lastWebhookAt = new Date();
    await settings.save();
    return {
      ok: true,
      reason: "not_forward",
      from: shipment.status,
      to: mapped,
    };
  }

  const fulfillment = require("../fulfillment/service");
  const noteParts = [
    data?.message || "",
    data?.location || "",
    eventType ? `Shipoo ${eventType}` : "Shipoo tracking update",
  ].filter(Boolean);

  const result = await fulfillment.updateShipmentStatus({
    shipmentId: shipment._id,
    companyId: shipment.companyId,
    status: mapped,
    note: noteParts.join(" · "),
    happenedAt: data?.occurredAt,
    source: "shipoo",
  });

  const fresh = await Shipment.findById(shipment._id);
  if (fresh) {
    fresh.metadata = {
      ...(fresh.metadata || {}),
      shipooLastEventId: eventId || undefined,
      shipooLastStatus: data?.status || mapped,
      shipooTrackingRecordId:
        data?.trackingRecordId || fresh.metadata?.shipooTrackingRecordId,
    };
    await fresh.save();
  }

  settings.lastWebhookAt = new Date();
  await settings.save();

  return {
    ok: true,
    reason: "updated",
    status: mapped,
    shipmentId: String(shipment._id),
    shipment: result.shipment,
  };
}

module.exports = {
  getSettings,
  getSettingsDoc,
  saveSettings,
  isEnabledForCompany,
  resolveWebhookSecret,
  verifyWebhookSignature,
  registerShipmentTracking,
  applyTrackingWebhook,
  mapShipooStatus,
  webhookUrl,
  toPublic,
};
