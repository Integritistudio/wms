import { describe, expect, it } from 'vitest';
import { computeNextRetryAt } from './backoff.util.js';

describe('computeNextRetryAt', () => {
  it('grows exponentially and caps at max', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const first = computeNextRetryAt({
      attempts: 1,
      baseDelaySeconds: 30,
      maxDelaySeconds: 90,
      multiplier: 2,
      jitter: false,
      now,
    });
    expect(first.getTime() - now.getTime()).toBe(30_000);

    const third = computeNextRetryAt({
      attempts: 3,
      baseDelaySeconds: 30,
      maxDelaySeconds: 90,
      multiplier: 2,
      jitter: false,
      now,
    });
    // 30 * 2^2 = 120, capped to 90
    expect(third.getTime() - now.getTime()).toBe(90_000);
  });
});
