import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobQueue } from '../common/enums.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PollersService } from '../pollers/pollers.service.js';
import { TransfersService } from '../transfers/transfers.service.js';

@Injectable()
export class TransferWorker implements OnModuleInit {
  private readonly logger = new Logger(TransferWorker.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly transfers: TransfersService,
    private readonly pollers: PollersService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.work<{ transferId: string }>(JobQueue.TRANSFER, async ({ data }) => {
      if (!data?.transferId) return;
      await this.transfers.execute(data.transferId);
    });

    await this.jobs.enqueue(JobQueue.TRANSFER_TICK, {}, { singletonKey: 'boot' });
    await this.jobs.work(
      JobQueue.TRANSFER_TICK,
      async () => {
        const batch = this.config.get<number>('transfer.batchSize') ?? 20;
        try {
          const due = await this.transfers.pickDue(batch);
          for (const t of due) {
            await this.jobs.enqueue(
              JobQueue.TRANSFER,
              { transferId: t.id },
              { singletonKey: t.id },
            );
          }
        } catch (err) {
          this.logger.error({ err }, 'Transfer tick failed');
        }
        const seconds = this.config.get<number>('transfer.pollSeconds') ?? 5;
        await this.jobs.enqueue(
          JobQueue.TRANSFER_TICK,
          {},
          { singletonKey: 'poll', startAfter: seconds },
        );
      },
      1,
    );

    await this.jobs.enqueue(JobQueue.INBOUND_TICK, {}, { singletonKey: 'boot' });
    await this.jobs.work(
      JobQueue.INBOUND_TICK,
      async () => {
        try {
          await this.pollers.pollAll();
        } catch (err) {
          this.logger.error({ err }, 'Inbound tick failed');
        }
        const seconds = this.config.get<number>('inbound.pollSeconds') ?? 60;
        await this.jobs.enqueue(
          JobQueue.INBOUND_TICK,
          {},
          { singletonKey: 'poll', startAfter: seconds },
        );
      },
      1,
    );
  }
}
