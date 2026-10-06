import { describe, expect, it, vi } from 'vitest';
import {
  NormalizedTrackingStatus,
  DomainEventType,
} from '../common/enums.js';
import { TrackingEventProcessor } from './tracking-event.processor.js';

describe('TrackingEventProcessor ordering', () => {
  it('does not regress status when an older checkpoint arrives', async () => {
    const record = {
      id: 'rec-1',
      tenantId: 't1',
      externalShipmentId: 'ext-1',
      carrier: 'usps',
      trackingNumber: '1',
      currentStatus: NormalizedTrackingStatus.DELIVERED,
      lastEventAt: new Date('2024-06-18T10:00:00Z'),
      reconcileUntil: null,
    };
    const recordsRepo = {
      save: vi.fn(async (r) => r),
    };
    const historyRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((x) => x),
      save: vi.fn(async (x) => x),
    };
    const domainEventsRepo = {
      save: vi.fn(async (x) => x),
      create: vi.fn((x) => x),
    };
    const outbound = {
      enqueueDeliveriesForEvent: vi.fn(),
    };
    const processor = new TrackingEventProcessor(
      recordsRepo as never,
      historyRepo as never,
      domainEventsRepo as never,
      outbound as never,
    );
    await processor.applyCheckpoint(
      record as never,
      {
        occurredAt: new Date('2024-06-17T10:00:00Z'),
        providerStatus: 'TRANSIT',
        normalizedStatus: NormalizedTrackingStatus.IN_TRANSIT,
        sequenceKey: 'older-event',
        raw: {},
      },
    );
    expect(record.currentStatus).toBe(NormalizedTrackingStatus.DELIVERED);
    expect(outbound.enqueueDeliveriesForEvent).not.toHaveBeenCalled();
  });

  it('emits domain events when status changes', async () => {
    const record = {
      id: 'rec-1',
      tenantId: 't1',
      externalShipmentId: 'ext-1',
      carrier: 'usps',
      trackingNumber: '1',
      currentStatus: NormalizedTrackingStatus.UNKNOWN,
      lastEventAt: null,
      reconcileUntil: new Date(),
    };
    const recordsRepo = { save: vi.fn(async (r) => r) };
    const historyRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((x) => x),
      save: vi.fn(async (x) => x),
    };
    const domainEventsRepo = {
      save: vi.fn(async (x) => x),
      create: vi.fn((x) => x),
    };
    const outbound = { enqueueDeliveriesForEvent: vi.fn() };
    const processor = new TrackingEventProcessor(
      recordsRepo as never,
      historyRepo as never,
      domainEventsRepo as never,
      outbound as never,
    );
    await processor.applyCheckpoint(record as never, {
      occurredAt: new Date('2024-06-17T10:00:00Z'),
      providerStatus: 'TRANSIT',
      normalizedStatus: NormalizedTrackingStatus.IN_TRANSIT,
      sequenceKey: 'evt-1',
      raw: {},
    });
    expect(record.currentStatus).toBe(NormalizedTrackingStatus.IN_TRANSIT);
    expect(outbound.enqueueDeliveriesForEvent).toHaveBeenCalled();
    expect(domainEventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DomainEventType.TRACKING_IN_TRANSIT }),
    );
  });
});
