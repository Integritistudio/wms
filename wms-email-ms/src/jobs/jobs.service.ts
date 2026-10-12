import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss, type Job } from 'pg-boss';
import { JobQueue } from '../common/enums.js';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private boss!: PgBoss;
  private started = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.config.get<string>('database.host');
    const port = this.config.get<number>('database.port');
    const user = this.config.get<string>('database.username');
    const password = this.config.get<string>('database.password');
    const database = this.config.get<string>('database.name');
    const schema = this.config.get<string>('pgBoss.schema') ?? 'pgboss';
    const connectionString = `postgres://${encodeURIComponent(user ?? '')}:${encodeURIComponent(password ?? '')}@${host}:${port}/${database}`;

    this.boss = new PgBoss({ connectionString, schema });
    this.boss.on('error', (err: Error) => this.logger.error(err.message, err.stack));
    await this.boss.start();
    this.started = true;
    for (const queue of Object.values(JobQueue)) {
      await this.boss.createQueue(queue, {
        retryLimit: this.config.get<number>('pgBoss.retryLimit') ?? 8,
        retryDelay: this.config.get<number>('pgBoss.retryDelaySeconds') ?? 30,
        retryBackoff: true,
        expireInSeconds: this.config.get<number>('pgBoss.expireInSeconds') ?? 1800,
        deleteAfterSeconds: 60 * 60 * 24 * 14,
      });
    }
    this.logger.log('pg-boss started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.started) {
      await this.boss.stop({ graceful: true, timeout: 30000 });
    }
  }

  async enqueue(
    queue: JobQueue,
    payload: Record<string, unknown>,
    options?: { singletonKey?: string; startAfter?: number | Date | string },
  ): Promise<string | null> {
    if (!this.started) return null;
    return this.boss.send(queue, payload, {
      singletonKey: options?.singletonKey,
      startAfter: options?.startAfter,
    });
  }

  async work<T>(
    queue: JobQueue,
    handler: (job: { id: string; data: T }) => Promise<void>,
    localConcurrency?: number,
  ): Promise<void> {
    const concurrency =
      localConcurrency ?? this.config.get<number>('pgBoss.teamConcurrency') ?? 5;
    await this.boss.work<T>(
      queue,
      { batchSize: 1, localConcurrency: concurrency },
      async (jobs: Job<T>[]) => {
        const job = jobs[0];
        if (!job) return;
        await handler({ id: job.id, data: job.data });
      },
    );
  }
}
