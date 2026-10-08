export function computeNextRetryAt(opts: {
  attempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  multiplier: number;
  jitter: boolean;
  now?: Date;
}): Date {
  const exp = Math.max(0, opts.attempts - 1);
  let delay = opts.baseDelaySeconds * Math.pow(Number(opts.multiplier) || 2, exp);
  delay = Math.min(delay, opts.maxDelaySeconds);
  if (opts.jitter) {
    const factor = 0.85 + Math.random() * 0.3;
    delay = delay * factor;
  }
  const now = opts.now ?? new Date();
  return new Date(now.getTime() + Math.round(delay * 1000));
}
