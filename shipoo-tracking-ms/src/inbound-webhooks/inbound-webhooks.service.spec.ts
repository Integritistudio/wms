import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { InboundWebhooksService } from './inbound-webhooks.service.js';

describe('InboundWebhooksService', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), 'test/fixtures/shippo/track-updated-transit.json'),
      'utf8',
    ),
  );

  it('deduplicates identical provider events', async () => {
    const inboundRepo = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing', duplicate: false }),
      save: vi.fn(async (x) => ({ ...x, id: 'in-1' })),
      create: vi.fn((x) => x),
    };
    const provider = {
      parseInboundWebhook: vi.fn().mockReturnValue({
        idempotencyKey: 'same-key',
        carrier: 'usps',
        trackingNumber: '1',
      }),
    };
    const jobs = { enqueue: vi.fn().mockResolvedValue('job-1') };
    const service = new InboundWebhooksService(
      inboundRepo as never,
      provider as never,
      jobs as never,
    );
    const first = await service.handleShippoTrackUpdated(fixture);
    const second = await service.handleShippoTrackUpdated(fixture);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });
});
