import { describe, expect, it, vi } from 'vitest';
import { DomainEventType } from '../common/enums.js';
import { OutboundWebhookDispatcher } from './outbound-webhook.dispatcher.js';

describe('OutboundWebhookDispatcher', () => {
  it('enqueues one delivery job per subscribed destination', async () => {
    const destinations = [
      { id: 'dest-a', tenantId: 't1', enabled: true },
      { id: 'dest-b', tenantId: 't1', enabled: true },
      { id: 'dest-c', tenantId: 't1', enabled: true },
    ];
    const subscriptions = [
      { destinationId: 'dest-a', eventType: DomainEventType.TRACKING_UPDATED },
      { destinationId: 'dest-c', eventType: DomainEventType.TRACKING_UPDATED },
    ];
    const enqueue = vi.fn().mockResolvedValue('job-id');
    const deliveriesRepo = {
      save: vi.fn(async (x) => ({ ...x, id: `d-${x.destinationId}` })),
      create: vi.fn((x) => x),
    };
    const destinationsRepo = {
      find: vi.fn().mockResolvedValue(destinations),
    };
    const subscriptionsRepo = {
      findOne: vi.fn(async ({ where }: { where: { destinationId: string } }) =>
        subscriptions.find((s) => s.destinationId === where.destinationId) ?? null,
      ),
    };
    const dispatcher = new OutboundWebhookDispatcher(
      destinationsRepo as never,
      subscriptionsRepo as never,
      deliveriesRepo as never,
      { enqueue } as never,
    );
    await dispatcher.enqueueDeliveriesForEvent(
      't1',
      'evt-1',
      DomainEventType.TRACKING_UPDATED,
      { foo: 'bar' },
    );
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
