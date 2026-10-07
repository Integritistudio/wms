const env = require("../../config/env");
const logger = require("../../config/logger");

function baseUrl() {
  return String(env.shipooBaseUrl || "").replace(/\/+$/, "");
}

async function request(apiKey, path, { method = "GET", json } = {}) {
  const root = baseUrl();
  if (!root) {
    const err = new Error("Shipoo base URL is not configured");
    err.statusCode = 503;
    throw err;
  }
  if (!apiKey) {
    const err = new Error("Shipoo API key is not configured");
    err.statusCode = 400;
    throw err;
  }

  const url = `${root}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message =
      data?.message || data?.error || data?.raw || `Shipoo HTTP ${res.status}`;
    logger.warn({ status: res.status, path, message }, "Shipoo API error");
    const err = new Error(message);
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }

  return data;
}

async function registerTracking(apiKey, payload) {
  return request(apiKey, "/v1/tracking", { method: "POST", json: payload });
}

async function getTracking(apiKey, trackingRecordId) {
  return request(apiKey, `/v1/tracking/${trackingRecordId}`);
}

module.exports = {
  baseUrl,
  registerTracking,
  getTracking,
};
