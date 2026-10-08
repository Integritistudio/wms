import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FailuresModule } from './failures/failures.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LinkerModule } from './linker/linker.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    DatabaseModule,
    AuthModule,
    JobsModule,
    LinkerModule,
    HealthModule,
    FailuresModule,
    AlertsModule,
    WorkersModule,
  ],
})
export class WorkerAppModule {}
