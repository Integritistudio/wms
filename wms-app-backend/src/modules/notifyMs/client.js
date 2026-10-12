const env = require("../../config/env");
const logger = require("../../config/logger");

function baseUrl() {
  return String(env.notifyMsBaseUrl || "").replace(/\/+$/, "");
}

function enabled() {
  return Boolean(baseUrl() && env.notifyMsAdminSecret);
}

async function request(path, { method = "GET", json, query } = {}) {
  const root = baseUrl();
  if (!root || !env.notifyMsAdminSecret) {
    const err = new Error("Notify-ms is not configured");
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
    Authorization: `Bearer ${env.notifyMsAdminSecret}`,
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
      data?.message || data?.error || `Notify-ms HTTP ${res.status}`;
    logger.warn({ status: res.status, path, message }, "Notify-ms API error");
    const err = new Error(
      typeof message === "string" ? message : JSON.stringify(message),
    );
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  return data;
}

async function create(companyId, payload) {
  return request("/v1/admin/notifications", {
    method: "POST",
    query: { companyId: String(companyId) },
    json: payload,
  });
}

async function list(companyId, { unreadOnly, page, limit, userId } = {}) {
  return request("/v1/admin/notifications", {
    method: "GET",
    query: {
      companyId: String(companyId),
      unreadOnly: unreadOnly ? "true" : undefined,
      page,
      limit,
      userId,
    },
  });
}

async function countUnread(companyId, userId) {
  const data = await request("/v1/admin/notifications/unread-count", {
    method: "GET",
    query: { companyId: String(companyId), userId },
  });
  return Number(data?.count || 0);
}

async function markRead(companyId, id) {
  return request(`/v1/admin/notifications/${id}/read`, {
    method: "POST",
    query: { companyId: String(companyId) },
  });
}

async function markAllRead(companyId, userId) {
  return request("/v1/admin/notifications/read-all", {
    method: "POST",
    query: { companyId: String(companyId), userId },
  });
}

async function upsertDevice(companyId, payload) {
  return request("/v1/admin/devices", {
    method: "PUT",
    query: { companyId: String(companyId) },
    json: payload,
  });
}

module.exports = {
  baseUrl,
  enabled,
  create,
  list,
  countUnread,
  markRead,
  markAllRead,
  upsertDevice,
};
