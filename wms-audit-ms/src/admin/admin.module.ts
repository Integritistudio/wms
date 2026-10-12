import { Module } from '@nestjs/common';
import { EntriesModule } from '../entries/entries.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [TenantsModule, EntriesModule],
  controllers: [AdminController],
})
export class AdminModule {}
