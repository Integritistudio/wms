const env = require("../../config/env");
const logger = require("../../config/logger");

function baseUrl() {
  return String(env.failedMsBaseUrl || "").replace(/\/+$/, "");
}

function enabled() {
  return Boolean(baseUrl() && env.failedMsAdminSecret);
}

async function request(path, { method = "GET", json, query } = {}) {
  const root = baseUrl();
  if (!root) {
    const err = new Error("Failed-ms base URL is not configured");
    err.statusCode = 503;
    throw err;
  }
  const secret = env.failedMsAdminSecret;
  if (!secret) {
    const err = new Error("Failed-ms admin secret is not configured");
    err.statusCode = 503;
    throw err;
  }

  const qs =
    query && Object.keys(query).length
      ? `?${new URLSearchParams(
          Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "")
        ).toString()}`
      : "";
  const url = `${root}${path.startsWith("/") ? path : `/${path}`}${qs}`;
  const headers = {
    Authorization: `Bearer ${secret}`,
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
      data?.message ||
      data?.error ||
      (Array.isArray(data?.message) ? data.message.join(", ") : null) ||
      data?.raw ||
      `Failed-ms HTTP ${res.status}`;
    logger.warn({ status: res.status, path, message }, "Failed-ms API error");
    const err = new Error(typeof message === "string" ? message : JSON.stringify(message));
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.data = data;
    throw err;
  }

  return data;
}

async function ingest(payload) {
  return request("/v1/admin/failures", { method: "POST", json: payload });
}

async function list(companyId, opts = {}) {
  return request("/v1/admin/failures", {
    query: {
      companyId,
      resolved: opts.resolved === true ? "true" : "false",
      q: opts.q,
      page: opts.page,
      limit: opts.limit,
      reason: opts.reason,
      warehouseIds: opts.warehouseIds?.length ? opts.warehouseIds.join(",") : undefined,
    },
  });
}

async function count(companyId, warehouseIds = null) {
  return request("/v1/admin/failures/count", {
    query: {
      companyId,
      warehouseIds: warehouseIds?.length ? warehouseIds.join(",") : undefined,
    },
  });
}

async function getById(companyId, id) {
  return request(`/v1/admin/failures/${id}`, { query: { companyId } });
}

async function retry(companyId, id, actor) {
  return request(`/v1/admin/failures/${id}/retry`, {
    method: "POST",
    query: { companyId },
    json: { actor },
  });
}

async function reassign(companyId, id, warehouseId, actor) {
  return request(`/v1/admin/failures/${id}/reassign`, {
    method: "POST",
    query: { companyId },
    json: { warehouseId, actor },
  });
}

async function skip(companyId, id, actor) {
  return request(`/v1/admin/failures/${id}/skip`, {
    method: "POST",
    query: { companyId },
    json: { actor },
  });
}

async function bulk(companyId, action, ids, actor) {
  return request("/v1/admin/failures/bulk", {
    method: "POST",
    query: { companyId },
    json: { action, ids, actor },
  });
}

async function resolve(companyId, id, { resolution, resolvedBy } = {}) {
  if (resolution === "skipped") {
    return skip(companyId, id, resolvedBy);
  }
  return request(`/v1/admin/failures/${id}/ack`, {
    method: "POST",
    query: { companyId },
    json: {
      result: "success",
      resolution: resolution || "retried",
      actor: resolvedBy || "linker",
    },
  });
}

module.exports = {
  baseUrl,
  enabled,
  ingest,
  list,
  count,
  getById,
  retry,
  reassign,
  skip,
  bulk,
  resolve,
};
