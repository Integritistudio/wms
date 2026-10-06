import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    MetricsModule,
    DatabaseModule,
    JobsModule,
    HealthModule,
    WorkersModule,
  ],
})
export class WorkerAppModule {}
