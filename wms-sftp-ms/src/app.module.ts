import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware.js';
import { AppConfigModule } from './config/config.module.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PollersModule } from './pollers/pollers.module.js';
import { SftpModule } from './sftp/sftp.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { TransfersModule } from './transfers/transfers.module.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    DatabaseModule,
    AuthModule,
    JobsModule,
    SftpModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    HealthModule,
    TenantsModule,
    ConnectionsModule,
    TransfersModule,
    PollersModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
