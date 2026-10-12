import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { TransfersModule } from '../transfers/transfers.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [TenantsModule, ConnectionsModule, TransfersModule],
  controllers: [AdminController],
})
export class AdminModule {}
