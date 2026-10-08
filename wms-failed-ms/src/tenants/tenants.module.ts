import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertRule } from '../database/entities/alert-rule.entity.js';
import { RetryPolicy } from '../database/entities/retry-policy.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { TenantsAdminController } from './tenants-admin.controller.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, RetryPolicy, AlertRule])],
  controllers: [TenantsAdminController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
