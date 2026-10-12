import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PushModule } from './push/push.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    JobsModule,
    PushModule,
    HealthModule,
    TenantsModule,
    NotificationsModule,
    WorkersModule,
  ],
})
export class WorkerAppModule {}
