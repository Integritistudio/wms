const attempts = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function clientKey(request) {
  return request.ip || request.headers["x-forwarded-for"] || "unknown";
}

function hit(request) {
  const key = clientKey(request);
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_ATTEMPTS - 1 };
  }

  current.count += 1;
  if (current.count > MAX_ATTEMPTS) {
    return { ok: false, retryAt: current.resetAt };
  }

  return { ok: true, remaining: MAX_ATTEMPTS - current.count };
}

function clear(request) {
  attempts.delete(clientKey(request));
}

module.exports = {
  hit,
  clear,
};
