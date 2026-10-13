const { createHmac, createHash, timingSafeEqual } = require("node:crypto");

function signature(secret, { method, url, tenantId, timestamp, body = "" }) {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret)
    .update([method.toUpperCase(), url, tenantId, timestamp, digest].join("\n"))
    .digest("hex");
}

function authenticate(request, secret, now = Date.now()) {
  const tenantId = request.headers["x-routing-tenant"];
  const timestamp = request.headers["x-routing-timestamp"];
  const supplied = request.headers["x-routing-signature"];
  const reject = () => { throw Object.assign(new Error("Unauthorized routing request"), { statusCode: 401 }); };
  if (typeof tenantId !== "string" || !/^[a-f\d]{24}$/i.test(tenantId)) reject();
  if (typeof timestamp !== "string" || !/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60000) reject();
  if (typeof supplied !== "string" || !/^[a-f\d]{64}$/i.test(supplied)) reject();
  const expected = signature(secret, {
    method: request.method, url: request.raw.url, tenantId, timestamp, body: request.rawBody || "",
  });
  if (!timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))) reject();
  return tenantId.toLowerCase();
}

module.exports = { signature, authenticate };
