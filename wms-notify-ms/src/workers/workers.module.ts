import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../database/entities/device.entity.js';
import { Notification } from '../database/entities/notification.entity.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PushModule } from '../push/push.module.js';
import { PushWorker } from './push.worker.js';

@Module({
  imports: [
    NotificationsModule,
    PushModule,
    TypeOrmModule.forFeature([Device, Notification]),
  ],
  providers: [PushWorker],
})
export class WorkersModule {}
