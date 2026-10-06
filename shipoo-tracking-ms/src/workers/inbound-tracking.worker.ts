import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobQueue } from '../common/enums.js';
import { InboundProviderEvent } from '../database/entities/inbound-provider-event.entity.js';
import { TrackingRecord } from '../database/entities/tracking-record.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { TRACKING_PROVIDER } from '../providers/tracking/tracking-provider.interface.js';
import { ShippoTrackingProvider } from '../providers/shippo/shippo-tracking.provider.js';
import { TrackingEventProcessor } from '../tracking/tracking-event.processor.js';

@Injectable()
export class InboundTrackingWorker implements OnModuleInit {
  private readonly logger = new Logger(InboundTrackingWorker.name);

  constructor(
    private readonly jobs: JobsService,
    @InjectRepository(InboundProviderEvent)
    private readonly inboundRepo: Repository<InboundProviderEvent>,
    @InjectRepository(TrackingRecord)
    private readonly recordsRepo: Repository<TrackingRecord>,
    @Inject(TRACKING_PROVIDER)
    private readonly provider: ShippoTrackingProvider,
    private readonly processor: TrackingEventProcessor,
  ) {}

  onModuleInit(): void {
    void this.jobs.work<{ inboundEventId: string; correlationId?: string }>(
      JobQueue.INBOUND_TRACKING_PROCESS,
      async (job) => {
        const row = await this.inboundRepo.findOne({
          where: { id: job.data.inboundEventId },
        });
        if (!row || row.processedAt) {
          return;
        }
        const event = this.provider.parseInboundWebhook(row.payload);
        const record = await this.recordsRepo.findOne({
          where: {
            carrier: event.carrier.toLowerCase(),
            trackingNumber: event.trackingNumber,
          },
        });
        if (!record) {
          this.logger.warn(
            JSON.stringify({
              msg: 'inbound_tracking_unknown_record',
              carrier: event.carrier,
              trackingNumber: event.trackingNumber,
            }),
          );
          row.processedAt = new Date();
          await this.inboundRepo.save(row);
          return;
        }
        await this.processor.applyInboundEvent(
          record,
          event,
          job.data.correlationId,
        );
        row.processedAt = new Date();
        await this.inboundRepo.save(row);
      },
    );
  }
}
