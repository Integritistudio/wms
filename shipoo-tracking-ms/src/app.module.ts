import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './config/config.module.js';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { InboundWebhooksModule } from './inbound-webhooks/inbound-webhooks.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { OutboundWebhooksModule } from './outbound-webhooks/outbound-webhooks.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { TrackingModule } from './tracking/tracking.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ObserveModule, ObserveInstrument } from './observe.bootstrap.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    MetricsModule,
    DatabaseModule,
    AuthModule,
    JobsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ...ObserveModule,
    HealthModule,
    TenantsModule,
    ProvidersModule,
    TrackingModule,
    OutboundWebhooksModule,
    InboundWebhooksModule,
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

export { ObserveInstrument };
