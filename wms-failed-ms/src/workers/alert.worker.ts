import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from '../alerts/alerts.service.js';
import { JobQueue } from '../common/enums.js';
import { JobsService } from '../jobs/jobs.service.js';

@Injectable()
export class AlertWorker implements OnModuleInit {
  private readonly logger = new Logger(AlertWorker.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.enqueue(JobQueue.ALERT_TICK, {}, { singletonKey: 'boot' });
    await this.jobs.work(
      JobQueue.ALERT_TICK,
      async () => {
        try {
          await this.alerts.checkAllTenants();
        } catch (err) {
          this.logger.error({ err }, 'Alert tick failed');
        }
        const seconds = this.config.get<number>('alerts.pollSeconds') ?? 60;
        await this.jobs.enqueue(
          JobQueue.ALERT_TICK,
          {},
          { singletonKey: 'poll', startAfter: seconds },
        );
      },
      1,
    );
  }
}
