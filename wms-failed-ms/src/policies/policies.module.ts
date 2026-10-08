import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { RetryPolicy } from '../database/entities/retry-policy.entity.js';
import { PoliciesController } from './policies.controller.js';
import { PoliciesService } from './policies.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([RetryPolicy, ActionAudit])],
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
