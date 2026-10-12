import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { Notification } from '../database/entities/notification.entity.js';
import { Preference } from '../database/entities/preference.entity.js';
import { PushDelivery } from '../database/entities/push-delivery.entity.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      Device,
      Preference,
      PushDelivery,
      ActionAudit,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
