const env = require("../../config/env");
const logger = require("../../config/logger");

function baseUrl() {
  return String(env.emailMsBaseUrl || "").replace(/\/+$/, "");
}

function enabled() {
  return Boolean(baseUrl() && env.emailMsAdminSecret);
}

async function request(path, { method = "GET", json, query, timeoutMs = 15000 } = {}) {
  const root = baseUrl();
  if (!root || !env.emailMsAdminSecret) {
    const err = new Error("Email-ms is not configured");
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
    Authorization: `Bearer ${env.emailMsAdminSecret}`,
    Accept: "application/json",
  };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err?.name === "AbortError";
    const message = aborted
      ? `Email-ms timed out after ${timeoutMs}ms`
      : err?.message || "Email-ms request failed";
    logger.warn({ path, message }, "Email-ms network error");
    const out = new Error(message);
    out.statusCode = aborted ? 504 : 502;
    throw out;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message =
      data?.message || data?.error || `Email-ms HTTP ${res.status}`;
    logger.warn({ status: res.status, path, message }, "Email-ms API error");
    const err = new Error(
      typeof message === "string" ? message : JSON.stringify(message),
    );
    err.statusCode =
      res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  return data;
}

async function ensureTenant(companyId, { name, slug } = {}) {
  return request("/v1/admin/tenants/ensure", {
    method: "POST",
    json: {
      externalCompanyId: String(companyId),
      name,
      slug,
    },
  });
}

async function send(companyId, payload) {
  const to = Array.isArray(payload.to)
    ? payload.to
    : String(payload.to || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  return request("/v1/admin/mail", {
    method: "POST",
    query: { companyId: String(companyId) },
    json: {
      ...payload,
      to,
    },
  });
}

async function listMail(companyId, { status, page, limit } = {}) {
  return request("/v1/admin/mail", {
    method: "GET",
    query: { companyId: String(companyId), status, page, limit },
  });
}

async function getSmtp(companyId) {
  return request("/v1/admin/smtp", {
    method: "GET",
    query: { companyId: String(companyId) },
  });
}

async function upsertSmtp(companyId, settings) {
  return request("/v1/admin/smtp", {
    method: "PUT",
    query: { companyId: String(companyId) },
    json: {
      host: settings.host,
      port: settings.port ?? 587,
      secure: Boolean(settings.secure),
      username: settings.username,
      password: settings.password,
      fromAddress: settings.fromAddress || settings.fromEmail,
      fromName: settings.fromName || "WMS Linker",
    },
  });
}

async function setPlatformFallback(companyId, allowPlatformSmtpFallback) {
  return request("/v1/admin/tenant/fallback", {
    method: "PATCH",
    query: { companyId: String(companyId) },
    json: { allowPlatformSmtpFallback: Boolean(allowPlatformSmtpFallback) },
  });
}

module.exports = {
  baseUrl,
  enabled,
  ensureTenant,
  send,
  listMail,
  getSmtp,
  upsertSmtp,
  setPlatformFallback,
};
