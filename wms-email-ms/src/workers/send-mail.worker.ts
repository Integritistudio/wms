import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobQueue } from '../common/enums.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MailService } from '../mail/mail.service.js';

@Injectable()
export class SendMailWorker implements OnModuleInit {
  private readonly logger = new Logger(SendMailWorker.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.work<{ messageId: string }>(
      JobQueue.SEND_MAIL,
      async ({ data }) => {
        if (!data?.messageId) return;
        await this.mail.deliver(data.messageId);
      },
    );

    await this.jobs.enqueue(JobQueue.MAIL_TICK, {}, { singletonKey: 'boot' });
    await this.jobs.work(
      JobQueue.MAIL_TICK,
      async () => {
        const batch = this.config.get<number>('mail.batchSize') ?? 25;
        try {
          const due = await this.mail.pickDue(batch);
          for (const msg of due) {
            await this.jobs.enqueue(
              JobQueue.SEND_MAIL,
              { messageId: msg.id },
              { singletonKey: msg.id },
            );
          }
        } catch (err) {
          this.logger.error({ err }, 'Mail tick failed');
        }
        const seconds = this.config.get<number>('mail.pollSeconds') ?? 5;
        await this.jobs.enqueue(
          JobQueue.MAIL_TICK,
          {},
          { singletonKey: 'poll', startAfter: seconds },
        );
      },
      1,
    );
  }
}
