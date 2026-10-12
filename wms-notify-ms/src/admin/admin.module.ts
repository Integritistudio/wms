import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PreferencesModule } from '../preferences/preferences.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [TenantsModule, NotificationsModule, DevicesModule, PreferencesModule],
  controllers: [AdminController],
})
export class AdminModule {}
