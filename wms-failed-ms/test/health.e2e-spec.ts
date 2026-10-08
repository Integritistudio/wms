import { describe, expect, it } from 'vitest';
import { computeNextRetryAt } from '../src/failures/backoff.util.js';

describe('failed-ms smoke', () => {
  it('exports backoff helper used by workers', () => {
    const next = computeNextRetryAt({
      attempts: 1,
      baseDelaySeconds: 10,
      maxDelaySeconds: 100,
      multiplier: 2,
      jitter: false,
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(next.toISOString()).toBe('2026-01-01T00:00:10.000Z');
  });
});
