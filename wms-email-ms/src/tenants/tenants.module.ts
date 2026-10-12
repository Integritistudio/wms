import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { SmtpCredential } from '../database/entities/smtp-credential.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { TenantsAdminController } from './tenants-admin.controller.js';
import { TenantsController } from './tenants.controller.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, SmtpCredential, ActionAudit])],
  controllers: [TenantsAdminController, TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
