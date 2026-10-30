const env = require("../../config/env");
const logger = require("../../config/logger");

function baseUrl() {
  return String(env.emailMsBaseUrl || "").replace(/\/+$/, "");
}

function enabled() {
  // Email delivery is handled by the main backend. Legacy integration is paused.
  return false;
}

async function request(path, { method = "GET", json, query, timeoutMs = 15000 } = {}) {
  const root = baseUrl();
  if (!enabled()) {
    const err = new Error("Email microservice is paused; use the main backend SMTP sender");
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
      ? `Email service timed out after ${timeoutMs}ms`
      : `Email service unreachable (${root}): ${err?.message || "request failed"}`;
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
    const raw = data?.message || data?.error || `Email-ms HTTP ${res.status}`;
    const message = Array.isArray(raw) ? raw.join("; ") : raw;
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
  const json = {
    host: settings.host,
    port: settings.port ?? 587,
    secure: Boolean(settings.secure),
    fromAddress: settings.fromAddress || settings.fromEmail,
    fromName: settings.fromName || "WMS Linker",
  };
  if (String(settings.username || "").trim()) {
    json.username = String(settings.username).trim();
  }
  if (settings.password) json.password = String(settings.password);
  return request("/v1/admin/smtp", {
    method: "PUT",
    query: { companyId: String(companyId) },
    json,
  });
}

async function testSend(companyId, payload) {
  const to = Array.isArray(payload.to)
    ? payload.to
    : String(payload.to || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const json = {
    to,
    host: payload.host,
    port: payload.port,
    secure: Boolean(payload.secure),
    fromAddress: payload.fromAddress || payload.fromEmail,
    fromName: payload.fromName,
  };
  if (String(payload.username || "").trim()) json.username = String(payload.username).trim();
  if (payload.password) json.password = String(payload.password);
  return request("/v1/admin/smtp/test", {
    method: "POST",
    query: { companyId: String(companyId) },
    json,
    timeoutMs: 25000,
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
  testSend,
  setPlatformFallback,
};
