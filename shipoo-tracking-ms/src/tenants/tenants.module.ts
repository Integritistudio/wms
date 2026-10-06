import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantProviderCredential } from '../database/entities/tenant-provider-credential.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { TenantsAdminController } from './tenants-admin.controller.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantProviderCredential])],
  controllers: [TenantsAdminController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
