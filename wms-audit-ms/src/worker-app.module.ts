import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EntriesModule } from './entries/entries.module.js';
import { HealthModule } from './health/health.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    HealthModule,
    TenantsModule,
    EntriesModule,
    WorkersModule,
  ],
})
export class WorkerAppModule {}
