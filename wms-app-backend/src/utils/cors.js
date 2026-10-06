const DEFAULT_ALLOWED_ORIGINS = [
  "https://wms-demo.integritistudio.us",
  "https://wms.integritistudio.us",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

/**
 * Resolve Access-Control-Allow-Origin for a request.
 * Supports CORS_ORIGIN=* or a comma-separated allowlist.
 * Always permits the Integriti demo/prod frontends.
 */
function resolveCorsOrigin(requestOrigin, corsOriginEnv) {
  const configured = String(corsOriginEnv || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowAll = configured.includes("*");
  const allowlist = new Set([
    ...configured.filter((o) => o !== "*"),
    ...DEFAULT_ALLOWED_ORIGINS,
  ]);

  if (requestOrigin && (allowAll || allowlist.has(requestOrigin))) {
    return requestOrigin;
  }

  if (allowAll) {
    return "*";
  }

  return configured[0] || DEFAULT_ALLOWED_ORIGINS[0];
}

function applyCorsHeaders(request, reply, corsOriginEnv) {
  const requestOrigin = request.headers.origin;
  const allowOrigin = resolveCorsOrigin(requestOrigin, corsOriginEnv);

  reply.header("Access-Control-Allow-Origin", allowOrigin);
  reply.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  );

  const requestedHeaders = request.headers["access-control-request-headers"];
  reply.header(
    "Access-Control-Allow-Headers",
    requestedHeaders ||
      "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  );
  reply.header("Access-Control-Max-Age", "86400");
  reply.header("Vary", "Origin");

  if (allowOrigin !== "*") {
    reply.header("Access-Control-Allow-Credentials", "true");
  }
}

module.exports = {
  DEFAULT_ALLOWED_ORIGINS,
  resolveCorsOrigin,
  applyCorsHeaders,
};
