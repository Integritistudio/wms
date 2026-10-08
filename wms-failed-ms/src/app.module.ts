import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FailuresModule } from './failures/failures.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LinkerModule } from './linker/linker.module.js';
import { PoliciesModule } from './policies/policies.module.js';
import { TenantsModule } from './tenants/tenants.module.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    DatabaseModule,
    AuthModule,
    JobsModule,
    LinkerModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    HealthModule,
    TenantsModule,
    FailuresModule,
    PoliciesModule,
    AlertsModule,
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
