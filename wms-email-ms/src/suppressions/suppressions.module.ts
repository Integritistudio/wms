import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Suppression } from '../database/entities/suppression.entity.js';
import { SuppressionsController } from './suppressions.controller.js';
import { SuppressionsService } from './suppressions.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Suppression, ActionAudit])],
  controllers: [SuppressionsController],
  providers: [SuppressionsService],
  exports: [SuppressionsService],
})
export class SuppressionsModule {}
