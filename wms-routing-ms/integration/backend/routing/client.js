const { createHmac, createHash } = require("node:crypto");
const env = require("../../config/env");
const { httpError } = require("../../utils/httpError");

async function request(companyId, path, { method = "GET", json } = {}) {
  const tenantId = String(companyId || "").toLowerCase();
  if (!/^[a-f\d]{24}$/i.test(tenantId)) throw httpError(400, "Invalid routing tenant");
  if (!env.routingMsBaseUrl || !env.routingMsSecret || env.routingMsSecret.length < 32) {
    throw httpError(503, "Routing microservice is not configured");
  }
  const url = new URL(`${env.routingMsBaseUrl}/v1/routing${path}`);
  const timestamp = String(Date.now());
  const body = json === undefined ? "" : JSON.stringify(json);
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", env.routingMsSecret)
    .update([method, `${url.pathname}${url.search}`, tenantId, timestamp, digest].join("\n")).digest("hex");
  let response;
  try {
    response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(env.routingMsTimeoutMs),
      headers: { "x-routing-tenant": tenantId, "x-routing-timestamp": timestamp, "x-routing-signature": signature,
        Accept: "application/json", ...(json === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(json === undefined ? {} : { body }),
    });
  } catch { throw httpError(503, "Routing microservice is unavailable"); }
  let data;
  try { data = await response.json(); } catch { throw httpError(502, "Invalid routing microservice response"); }
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : response.status, data?.message || "Routing request failed");
  return data;
}

module.exports = { request };
