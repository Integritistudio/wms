import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss, type Job } from 'pg-boss';
import { JobQueue } from '../common/enums.js';

export interface JobEnqueueOptions {
  retryLimit?: number;
  retryDelay?: number;
  expireInSeconds?: number;
  singletonKey?: string;
  retryBackoff?: boolean;
}

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
    await this.ensureQueues();
    this.logger.log('pg-boss started');
  }

  private queueDefaults() {
    return {
      retryLimit: this.config.get<number>('pgBoss.retryLimit') ?? 5,
      retryDelay: this.config.get<number>('pgBoss.retryDelaySeconds') ?? 30,
      retryBackoff: true,
      expireInSeconds: this.config.get<number>('pgBoss.expireInSeconds') ?? 900,
      deleteAfterSeconds: 60 * 60 * 24 * 7,
    };
  }

  private async ensureQueues(): Promise<void> {
    const defaults = this.queueDefaults();
    const queues = Object.values(JobQueue);
    for (const queue of queues) {
      await this.boss.createQueue(queue, defaults);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.started) {
      await this.boss.stop({ graceful: true, timeout: 30000 });
    }
  }

  getBoss(): PgBoss {
    return this.boss;
  }

  async enqueue(
    queue: JobQueue,
    payload: Record<string, unknown>,
    options?: JobEnqueueOptions,
  ): Promise<string | null> {
    if (!this.started) {
      this.logger.warn(`pg-boss not started; skipping enqueue to ${queue}`);
      return null;
    }
    const defaults = this.queueDefaults();
    return this.boss.send(queue, payload, {
      retryLimit: options?.retryLimit ?? defaults.retryLimit,
      retryDelay: options?.retryDelay ?? defaults.retryDelay,
      retryBackoff: options?.retryBackoff ?? defaults.retryBackoff,
      expireInSeconds: options?.expireInSeconds ?? defaults.expireInSeconds,
      singletonKey: options?.singletonKey,
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
        if (!job) {
          return;
        }
        await handler({ id: job.id, data: job.data });
      },
    );
  }
}
