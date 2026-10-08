import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobQueue } from '../common/enums.js';
import { FailuresService } from '../failures/failures.service.js';
import { JobsService } from '../jobs/jobs.service.js';

@Injectable()
export class StaleSweepWorker implements OnModuleInit {
  private readonly logger = new Logger(StaleSweepWorker.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly failures: FailuresService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.enqueue(JobQueue.STALE_SWEEP_TICK, {}, { singletonKey: 'boot' });
    await this.jobs.work(
      JobQueue.STALE_SWEEP_TICK,
      async () => {
        const hours = this.config.get<number>('stale.sweepHours') ?? 168;
        try {
          const n = await this.failures.expireStale(hours);
          if (n > 0) this.logger.warn({ n, hours }, 'Expired stale DLQ items');
        } catch (err) {
          this.logger.error({ err }, 'Stale sweep failed');
        }
        const minutes = this.config.get<number>('stale.pollMinutes') ?? 60;
        await this.jobs.enqueue(
          JobQueue.STALE_SWEEP_TICK,
          {},
          { singletonKey: 'poll', startAfter: minutes * 60 },
        );
      },
      1,
    );
  }
}
