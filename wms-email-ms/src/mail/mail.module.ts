import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { EmailMessage } from '../database/entities/email-message.entity.js';
import { EmailTemplate } from '../database/entities/email-template.entity.js';
import { Suppression } from '../database/entities/suppression.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { MailController } from './mail.controller.js';
import { MailService } from './mail.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailMessage,
      EmailTemplate,
      Suppression,
      Tenant,
      ActionAudit,
    ]),
    TenantsModule,
  ],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
