import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEventType, JobQueue, WebhookDeliveryStatus } from '../common/enums.js';
import { WebhookDelivery } from '../database/entities/webhook-delivery.entity.js';
import { WebhookDestinationSubscription } from '../database/entities/webhook-destination-subscription.entity.js';
import { WebhookDestination } from '../database/entities/webhook-destination.entity.js';
import { JobsService } from '../jobs/jobs.service.js';

@Injectable()
export class OutboundWebhookDispatcher {
  private readonly logger = new Logger(OutboundWebhookDispatcher.name);

  constructor(
    @InjectRepository(WebhookDestination)
    private readonly destinationsRepo: Repository<WebhookDestination>,
    @InjectRepository(WebhookDestinationSubscription)
    private readonly subscriptionsRepo: Repository<WebhookDestinationSubscription>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepo: Repository<WebhookDelivery>,
    private readonly jobs: JobsService,
  ) {}

  async enqueueDeliveriesForEvent(
    tenantId: string,
    domainEventId: string,
    eventType: DomainEventType,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    const destinations = await this.destinationsRepo.find({
      where: { tenantId, enabled: true },
    });
    for (const destination of destinations) {
      const sub = await this.subscriptionsRepo.findOne({
        where: { destinationId: destination.id, eventType },
      });
      if (!sub) {
        continue;
      }
      const delivery = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          domainEventId,
          destinationId: destination.id,
          tenantId,
          status: WebhookDeliveryStatus.PENDING,
          correlationId: correlationId ?? null,
        }),
      );
      const jobId = await this.jobs.enqueue(
        JobQueue.OUTBOUND_WEBHOOK_DELIVER,
        {
          deliveryId: delivery.id,
          domainEventId,
          destinationId: destination.id,
          tenantId,
          eventType,
          payload,
          correlationId,
        },
        { singletonKey: `${delivery.id}` },
      );
      if (jobId) {
        delivery.pgbossJobId = jobId;
        await this.deliveriesRepo.save(delivery);
      }
    }
    this.logger.log(
      JSON.stringify({
        msg: 'outbound_deliveries_enqueued',
        domainEventId,
        eventType,
        tenantId,
      }),
    );
  }
}
