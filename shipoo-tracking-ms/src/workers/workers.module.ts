import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboundProviderEvent } from '../database/entities/inbound-provider-event.entity.js';
import { TrackingRecord } from '../database/entities/tracking-record.entity.js';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { TrackingModule } from '../tracking/tracking.module.js';
import { InboundTrackingWorker } from './inbound-tracking.worker.js';
import { OutboundDeliveryWorker } from './outbound-delivery.worker.js';
import { ReconcileWorker } from './reconcile.worker.js';
import { TrackingRegisterWorker } from './tracking-register.worker.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([InboundProviderEvent, TrackingRecord]),
    TrackingModule,
    OutboundWebhooksModule,
    ProvidersModule,
    ReconciliationModule,
  ],
  providers: [
    InboundTrackingWorker,
    OutboundDeliveryWorker,
    TrackingRegisterWorker,
    ReconcileWorker,
  ],
})
export class WorkersModule {}
