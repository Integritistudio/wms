import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { EmailTemplate } from '../database/entities/email-template.entity.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate, ActionAudit])],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
