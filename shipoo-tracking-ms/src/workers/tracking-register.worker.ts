import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../common/enums.js';
import { JobsService } from '../jobs/jobs.service.js';
import { TrackingService } from '../tracking/tracking.service.js';

@Injectable()
export class TrackingRegisterWorker implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly tracking: TrackingService,
  ) {}

  onModuleInit(): void {
    void this.jobs.work(JobQueue.TRACKING_REGISTER, async (job) => {
      await this.tracking.processRegistrationJob(job.data as {
        tenantId: string;
        trackingRecordId: string;
        carrier: string;
        trackingNumber: string;
        correlationId?: string;
        isNew?: boolean;
      });
    });
  }
}
