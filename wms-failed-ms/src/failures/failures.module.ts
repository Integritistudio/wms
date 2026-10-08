import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { FailedItem } from '../database/entities/failed-item.entity.js';
import { RetryPolicy } from '../database/entities/retry-policy.entity.js';
import { FailuresController } from './failures.controller.js';
import { FailuresService } from './failures.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FailedItem, RetryPolicy, ActionAudit])],
  controllers: [FailuresController],
  providers: [FailuresService],
  exports: [FailuresService],
})
export class FailuresModule {}
