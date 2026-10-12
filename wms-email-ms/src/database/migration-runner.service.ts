import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';

const MIGRATIONS = ['001-initial', '002-platform-smtp-fallback'] as const;

@Injectable()
export class MigrationRunnerService implements OnModuleInit {
  private readonly logger = new Logger(MigrationRunnerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<boolean>('runMigrations')) return;
    await this.runPendingMigrations();
  }

  async runPendingMigrations(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(128) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const id of MIGRATIONS) {
      const existing = await this.dataSource.query(
        `SELECT id FROM schema_migrations WHERE id = $1`,
        [id],
      );
      if (existing.length > 0) continue;
      const sql = readFileSync(join(here, 'migrations', `${id}.sql`), 'utf8');
      await this.dataSource.transaction(async (manager) => {
        await manager.query(sql);
        await manager.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
      });
      this.logger.log(`Applied migration ${id}`);
    }
  }
}
