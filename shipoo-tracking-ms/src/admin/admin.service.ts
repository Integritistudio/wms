import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEventType, JobQueue, WebhookDeliveryStatus } from '../common/enums.js';
import { WebhookDelivery } from '../database/entities/webhook-delivery.entity.js';
import { DomainEvent } from '../database/entities/domain-event.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepo: Repository<WebhookDelivery>,
    @InjectRepository(DomainEvent)
    private readonly eventsRepo: Repository<DomainEvent>,
    private readonly jobs: JobsService,
    private readonly metrics: MetricsService,
  ) {}

  listDeliveries(status: WebhookDeliveryStatus, limit: number) {
    return this.deliveriesRepo.find({
      where: { status },
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }

  async retryDelivery(deliveryId: string) {
    const delivery = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    if (delivery.status === WebhookDeliveryStatus.SUCCESS) {
      return { retried: false, reason: 'already_success' };
    }
    const event = await this.eventsRepo.findOne({
      where: { id: delivery.domainEventId },
    });
    if (!event) {
      throw new NotFoundException('Domain event not found');
    }
    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.lastError = null;
    delivery.nextRetryAt = null;
    await this.deliveriesRepo.save(delivery);
    const jobId = await this.jobs.enqueue(JobQueue.OUTBOUND_WEBHOOK_DELIVER, {
      deliveryId: delivery.id,
      domainEventId: delivery.domainEventId,
      destinationId: delivery.destinationId,
      tenantId: delivery.tenantId,
      eventType: event.eventType as DomainEventType,
      payload: event.payload,
      correlationId: delivery.correlationId ?? undefined,
    });
    return { retried: true, jobId };
  }

  metricsSummary() {
    return this.metrics.snapshot();
  }
}
