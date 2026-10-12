import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantApiKey } from '../database/entities/tenant-api-key.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { ApiKeyService } from './api-key.service.js';
import { AdminGuard } from './guards/admin.guard.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { TenantContext } from './tenant.context.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TenantApiKey, Tenant])],
  providers: [
    ApiKeyService,
    ApiKeyGuard,
    AdminGuard,
    TenantContext,
    TenantContextInterceptor,
  ],
  exports: [
    ApiKeyService,
    ApiKeyGuard,
    AdminGuard,
    TenantContext,
    TenantContextInterceptor,
  ],
})
export class AuthModule {}
