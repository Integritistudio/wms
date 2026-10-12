import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../database/entities/tenant.entity.js';
import { TenantsAdminController } from './tenants-admin.controller.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantsAdminController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
