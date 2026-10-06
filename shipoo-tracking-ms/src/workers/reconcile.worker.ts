import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobQueue } from '../common/enums.js';
import { JobsService } from '../jobs/jobs.service.js';
import { TrackingService } from '../tracking/tracking.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';

@Injectable()
export class ReconcileWorker implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout;

  constructor(
    private readonly jobs: JobsService,
    private readonly tracking: TrackingService,
    private readonly reconciliation: ReconciliationService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    void this.jobs.work<{ tenantId: string; trackingRecordId: string }>(
      JobQueue.TRACKING_RECONCILE,
      async (job) => {
        await this.tracking.refresh(
          job.data.tenantId,
          job.data.trackingRecordId,
        );
      },
    );

    const minutes = this.config.get<number>('reconciliation.cronMinutes') ?? 15;
    this.interval = setInterval(
      () => {
        void this.reconciliation.enqueueStaleRecords();
      },
      minutes * 60_000,
    );
    void this.reconciliation.enqueueStaleRecords();
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}
