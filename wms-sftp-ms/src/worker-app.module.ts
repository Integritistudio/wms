import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { AppConfigModule } from './config/config.module.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PollersModule } from './pollers/pollers.module.js';
import { SftpModule } from './sftp/sftp.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    DatabaseModule,
    AuthModule,
    JobsModule,
    SftpModule,
    HealthModule,
    TenantsModule,
    ConnectionsModule,
    TransfersModule,
    PollersModule,
    WorkersModule,
  ],
})
export class WorkerAppModule {}
