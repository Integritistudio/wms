import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEventType, JobQueue } from '../common/enums.js';
import { JobsService } from '../jobs/jobs.service.js';
import {
  OutboundDeliveryPermanentError,
  OutboundDeliveryRetryableError,
  OutboundWebhookDeliveryService,
} from '../outbound-webhooks/outbound-webhook.delivery.service.js';

@Injectable()
export class OutboundDeliveryWorker implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly delivery: OutboundWebhookDeliveryService,
  ) {}

  onModuleInit(): void {
    void this.jobs.work(JobQueue.OUTBOUND_WEBHOOK_DELIVER, async (job) => {
      try {
        await this.delivery.deliver(
          job.data as {
            deliveryId: string | null;
            domainEventId: string;
            destinationId: string;
            tenantId: string;
            eventType: DomainEventType;
            payload: Record<string, unknown>;
            correlationId?: string;
            direct?: boolean;
          },
        );
      } catch (err) {
        if (err instanceof OutboundDeliveryPermanentError) {
          return;
        }
        if (err instanceof OutboundDeliveryRetryableError) {
          throw err;
        }
        throw err;
      }
    });
  }
}
