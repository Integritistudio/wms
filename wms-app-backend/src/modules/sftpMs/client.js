const env = require("../../config/env");
const logger = require("../../config/logger");

function baseUrl() {
  return String(env.sftpMsBaseUrl || "").replace(/\/+$/, "");
}

function enabled() {
  return Boolean(baseUrl() && env.sftpMsAdminSecret);
}

async function request(path, { method = "GET", json, query } = {}) {
  const root = baseUrl();
  if (!root || !env.sftpMsAdminSecret) {
    const err = new Error("SFTP-ms is not configured");
    err.statusCode = 503;
    throw err;
  }
  const qs =
    query && Object.keys(query).length
      ? `?${new URLSearchParams(
          Object.entries(query).filter(([, v]) => v != null && v !== ""),
        ).toString()}`
      : "";
  const url = `${root}${path.startsWith("/") ? path : `/${path}`}${qs}`;
  const headers = {
    Authorization: `Bearer ${env.sftpMsAdminSecret}`,
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
    const message = data?.message || data?.error || `SFTP-ms HTTP ${res.status}`;
    logger.warn({ status: res.status, path, message }, "SFTP-ms API error");
    const err = new Error(typeof message === "string" ? message : JSON.stringify(message));
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  return data;
}

async function upsertConnection(companyId, payload) {
  return request("/v1/admin/connections", {
    method: "PUT",
    query: { companyId: String(companyId) },
    json: payload,
  });
}

async function deliver(companyId, payload) {
  return request("/v1/admin/transfers", {
    method: "POST",
    query: { companyId: String(companyId) },
    json: payload,
  });
}

module.exports = {
  baseUrl,
  enabled,
  upsertConnection,
  deliver,
};
