import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NormalizedTrackingStatus } from '../../common/enums.js';
import { ShippoTrackingProvider } from './shippo-tracking.provider.js';

describe('ShippoTrackingProvider.parseInboundWebhook', () => {
  const provider = new ShippoTrackingProvider({} as never);

  it('parses track_updated fixture', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(process.cwd(), 'test/fixtures/shippo/track-updated-transit.json'),
        'utf8',
      ),
    );
    const event = provider.parseInboundWebhook(fixture);
    expect(event.trackingNumber).toBe('9205590164917312751089');
    expect(event.normalizedStatus).toBe(NormalizedTrackingStatus.IN_TRANSIT);
    expect(event.idempotencyKey).toHaveLength(64);
  });

  it('builds different idempotency keys for different timestamps', () => {
    const a = provider.parseInboundWebhook(
      JSON.parse(
        readFileSync(
          join(process.cwd(), 'test/fixtures/shippo/track-updated-transit.json'),
          'utf8',
        ),
      ),
    );
    const b = provider.parseInboundWebhook(
      JSON.parse(
        readFileSync(
          join(process.cwd(), 'test/fixtures/shippo/track-updated-delivered.json'),
          'utf8',
        ),
      ),
    );
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });
});
