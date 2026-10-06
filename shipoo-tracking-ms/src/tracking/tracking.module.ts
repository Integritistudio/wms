import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainEvent } from '../database/entities/domain-event.entity.js';
import { TrackingEventHistory } from '../database/entities/tracking-event-history.entity.js';
import { TrackingRecord } from '../database/entities/tracking-record.entity.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { TrackingController } from './tracking.controller.js';
import { TrackingEventProcessor } from './tracking-event.processor.js';
import { TrackingService } from './tracking.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrackingRecord,
      TrackingEventHistory,
      DomainEvent,
    ]),
    ProvidersModule,
    JobsModule,
    forwardRef(() => OutboundWebhooksModule),
  ],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingEventProcessor],
  exports: [TrackingService, TrackingEventProcessor],
})
export class TrackingModule {}
