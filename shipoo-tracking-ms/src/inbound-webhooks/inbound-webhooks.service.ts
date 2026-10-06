import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobQueue, TrackingProviderName } from '../common/enums.js';
import { InboundProviderEvent } from '../database/entities/inbound-provider-event.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { TRACKING_PROVIDER } from '../providers/tracking/tracking-provider.interface.js';
import { ShippoTrackingProvider } from '../providers/shippo/shippo-tracking.provider.js';

@Injectable()
export class InboundWebhooksService {
  private readonly logger = new Logger(InboundWebhooksService.name);

  constructor(
    @InjectRepository(InboundProviderEvent)
    private readonly inboundRepo: Repository<InboundProviderEvent>,
    @Inject(TRACKING_PROVIDER)
    private readonly provider: ShippoTrackingProvider,
    private readonly jobs: JobsService,
  ) {}

  async handleShippoTrackUpdated(
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<{ accepted: boolean; duplicate: boolean }> {
    const parsed = this.provider.parseInboundWebhook(payload);
    const existing = await this.inboundRepo.findOne({
      where: {
        provider: TrackingProviderName.SHIPPO,
        idempotencyKey: parsed.idempotencyKey,
      },
    });
    if (existing) {
      existing.duplicate = true;
      await this.inboundRepo.save(existing);
      return { accepted: true, duplicate: true };
    }
    const row = await this.inboundRepo.save(
      this.inboundRepo.create({
        provider: TrackingProviderName.SHIPPO,
        idempotencyKey: parsed.idempotencyKey,
        payload,
        duplicate: false,
      }),
    );
    await this.jobs.enqueue(
      JobQueue.INBOUND_TRACKING_PROCESS,
      {
        inboundEventId: row.id,
        correlationId,
      },
      { singletonKey: parsed.idempotencyKey },
    );
    this.logger.log(
      JSON.stringify({
        msg: 'inbound_webhook_enqueued',
        inboundEventId: row.id,
        correlationId,
      }),
    );
    return { accepted: true, duplicate: false };
  }
}
