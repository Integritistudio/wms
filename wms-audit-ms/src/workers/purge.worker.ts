import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntriesService } from '../entries/entries.service.js';

@Injectable()
export class PurgeWorker implements OnModuleInit {
  private readonly logger = new Logger(PurgeWorker.name);

  constructor(
    private readonly entries: EntriesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const hours = this.config.get<number>('purgeIntervalHours') ?? 6;
    const ms = Math.max(1, hours) * 60 * 60 * 1000;
    const run = async () => {
      try {
        const result = await this.entries.purgeExpired();
        this.logger.log(`Purged ${result.deleted} entries older than ${result.cutoff.toISOString()}`);
      } catch (err) {
        this.logger.error(
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err.stack : undefined,
        );
      }
    };
    void run();
    setInterval(() => void run(), ms);
    this.logger.log(`Purge worker scheduled every ${hours}h`);
  }
}
