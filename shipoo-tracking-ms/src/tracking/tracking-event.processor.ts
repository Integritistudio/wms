import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  DomainEventType,
  NormalizedTrackingStatus,
  TERMINAL_TRACKING_STATUSES,
} from '../common/enums.js';
import { DomainEvent } from '../database/entities/domain-event.entity.js';
import { TrackingEventHistory } from '../database/entities/tracking-event-history.entity.js';
import { TrackingRecord } from '../database/entities/tracking-record.entity.js';
import { OutboundWebhookDispatcher } from '../outbound-webhooks/outbound-webhook.dispatcher.js';
import { ProviderInboundEvent, ProviderTrackingCheckpoint } from '../providers/tracking/tracking-provider.interface.js';

@Injectable()
export class TrackingEventProcessor {
  private readonly logger = new Logger(TrackingEventProcessor.name);

  constructor(
    @InjectRepository(TrackingRecord)
    private readonly recordsRepo: Repository<TrackingRecord>,
    @InjectRepository(TrackingEventHistory)
    private readonly historyRepo: Repository<TrackingEventHistory>,
    @InjectRepository(DomainEvent)
    private readonly domainEventsRepo: Repository<DomainEvent>,
    private readonly outbound: OutboundWebhookDispatcher,
  ) {}

  async applyInboundEvent(
    record: TrackingRecord,
    event: ProviderInboundEvent,
    correlationId?: string,
  ): Promise<void> {
    await this.applyCheckpoint(record, {
      occurredAt: event.occurredAt,
      providerStatus: event.providerStatus ?? 'UNKNOWN',
      normalizedStatus: event.normalizedStatus,
      location: event.location,
      message: event.message,
      sequenceKey: event.sequenceKey,
      raw: event.raw,
    }, correlationId);
  }

  async applyCheckpoint(
    record: TrackingRecord,
    checkpoint: ProviderTrackingCheckpoint,
    correlationId?: string,
  ): Promise<void> {
    const existing = await this.historyRepo.findOne({
      where: { trackingRecordId: record.id, sequenceKey: checkpoint.sequenceKey },
    });
    if (!existing) {
      await this.historyRepo.save(
        this.historyRepo.create({
          trackingRecordId: record.id,
          tenantId: record.tenantId,
          normalizedStatus: checkpoint.normalizedStatus,
          providerStatus: checkpoint.providerStatus,
          occurredAt: checkpoint.occurredAt,
          location: checkpoint.location ?? null,
          message: checkpoint.message ?? null,
          raw: checkpoint.raw,
          sequenceKey: checkpoint.sequenceKey,
        }),
      );
    }

    const shouldAdvance =
      !record.lastEventAt || checkpoint.occurredAt >= record.lastEventAt;

    const previousStatus = record.currentStatus;
    if (shouldAdvance) {
      record.currentStatus = checkpoint.normalizedStatus;
      record.lastProviderStatus = checkpoint.providerStatus;
      record.lastEventAt = checkpoint.occurredAt;
      if (TERMINAL_TRACKING_STATUSES.includes(checkpoint.normalizedStatus)) {
        record.reconcileUntil = null;
      } else if (!record.reconcileUntil) {
        record.reconcileUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
      await this.recordsRepo.save(record);
    }

    if (shouldAdvance && (previousStatus !== record.currentStatus || !existing)) {
      const eventType = this.mapDomainEventType(record.currentStatus);
      await this.emitDomainEvent(record, eventType, checkpoint, correlationId);
      if (eventType !== DomainEventType.TRACKING_UPDATED) {
        await this.emitDomainEvent(
          record,
          DomainEventType.TRACKING_UPDATED,
          checkpoint,
          correlationId,
        );
      }
    }
  }

  private mapDomainEventType(status: NormalizedTrackingStatus): DomainEventType {
    switch (status) {
      case NormalizedTrackingStatus.IN_TRANSIT:
        return DomainEventType.TRACKING_IN_TRANSIT;
      case NormalizedTrackingStatus.OUT_FOR_DELIVERY:
        return DomainEventType.TRACKING_OUT_FOR_DELIVERY;
      case NormalizedTrackingStatus.DELIVERED:
        return DomainEventType.TRACKING_DELIVERED;
      case NormalizedTrackingStatus.EXCEPTION:
      case NormalizedTrackingStatus.FAILURE:
      case NormalizedTrackingStatus.DELIVERY_ATTEMPTED:
        return DomainEventType.TRACKING_EXCEPTION;
      case NormalizedTrackingStatus.RETURNED:
        return DomainEventType.TRACKING_RETURNED;
      default:
        return DomainEventType.TRACKING_UPDATED;
    }
  }

  private async emitDomainEvent(
    record: TrackingRecord,
    eventType: DomainEventType,
    checkpoint: ProviderTrackingCheckpoint,
    correlationId?: string,
  ): Promise<void> {
    const id = randomUUID();
    const payload = {
      trackingRecordId: record.id,
      externalShipmentId: record.externalShipmentId,
      carrier: record.carrier,
      trackingNumber: record.trackingNumber,
      status: record.currentStatus,
      providerStatus: checkpoint.providerStatus,
      occurredAt: checkpoint.occurredAt.toISOString(),
      location: checkpoint.location,
      message: checkpoint.message,
    };
    await this.domainEventsRepo.save(
      this.domainEventsRepo.create({
        id,
        tenantId: record.tenantId,
        trackingRecordId: record.id,
        eventType,
        payload,
        correlationId: correlationId ?? null,
      }),
    );
    await this.outbound.enqueueDeliveriesForEvent(
      record.tenantId,
      id,
      eventType,
      payload,
      correlationId,
    );
    this.logger.log(
      JSON.stringify({
        msg: 'domain_event_emitted',
        eventId: id,
        eventType,
        tenantId: record.tenantId,
        trackingRecordId: record.id,
        correlationId,
      }),
    );
  }

  async emitRegisteredEvent(record: TrackingRecord, correlationId?: string): Promise<void> {
    const id = randomUUID();
    const payload = {
      trackingRecordId: record.id,
      externalShipmentId: record.externalShipmentId,
      carrier: record.carrier,
      trackingNumber: record.trackingNumber,
      status: record.currentStatus,
    };
    await this.domainEventsRepo.save(
      this.domainEventsRepo.create({
        id,
        tenantId: record.tenantId,
        trackingRecordId: record.id,
        eventType: DomainEventType.TRACKING_REGISTERED,
        payload,
        correlationId: correlationId ?? null,
      }),
    );
    await this.outbound.enqueueDeliveriesForEvent(
      record.tenantId,
      id,
      DomainEventType.TRACKING_REGISTERED,
      payload,
      correlationId,
    );
  }
}
