import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { AlertEvent } from '../database/entities/alert-event.entity.js';
import { AlertRule } from '../database/entities/alert-rule.entity.js';
import { FailedItem } from '../database/entities/failed-item.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AlertRule,
      AlertEvent,
      FailedItem,
      Tenant,
      ActionAudit,
    ]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
