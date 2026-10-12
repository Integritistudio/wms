import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EntriesModule } from './entries/entries.module.js';
import { HealthModule } from './health/health.module.js';
import { TenantsModule } from './tenants/tenants.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    HealthModule,
    TenantsModule,
    EntriesModule,
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
