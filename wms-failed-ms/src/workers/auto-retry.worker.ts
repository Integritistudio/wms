import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobQueue } from '../common/enums.js';
import { FailuresService } from '../failures/failures.service.js';
import { JobsService } from '../jobs/jobs.service.js';

@Injectable()
export class AutoRetryWorker implements OnModuleInit {
  private readonly logger = new Logger(AutoRetryWorker.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly failures: FailuresService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const poll = this.config.get<number>('autoRetry.pollSeconds') ?? 15;
    // Run every minute via cron; also self-enqueue first tick soon
    await this.jobs.schedule(JobQueue.AUTO_RETRY_TICK, `*/${Math.max(1, Math.ceil(poll / 60))} * * * *`);
    await this.jobs.enqueue(JobQueue.AUTO_RETRY_TICK, {}, { singletonKey: 'boot' });

    await this.jobs.work<{ tick?: boolean }>(
      JobQueue.AUTO_RETRY_TICK,
      async () => {
        await this.tick();
        const seconds = this.config.get<number>('autoRetry.pollSeconds') ?? 15;
        await this.jobs.enqueue(
          JobQueue.AUTO_RETRY_TICK,
          {},
          {
            singletonKey: 'poll',
            startAfter: seconds,
          },
        );
      },
      1,
    );
  }

  private async tick(): Promise<void> {
    const batch = this.config.get<number>('autoRetry.batchSize') ?? 25;
    const due = await this.failures.pickDueForAutoRetry(batch);
    for (const item of due) {
      try {
        await this.failures.retry(item.tenantId, item.id, 'auto-retry', true);
        this.logger.log({ id: item.id }, 'Auto-retry succeeded');
      } catch (err) {
        this.logger.warn(
          { id: item.id, err: err instanceof Error ? err.message : err },
          'Auto-retry failed (will backoff)',
        );
      }
    }
  }
}
