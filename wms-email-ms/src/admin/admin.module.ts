import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [MailModule, TenantsModule],
  controllers: [AdminController],
})
export class AdminModule {}
