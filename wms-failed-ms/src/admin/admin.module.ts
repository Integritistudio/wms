import { Module } from '@nestjs/common';
import { FailuresModule } from '../failures/failures.module.js';
import { PoliciesModule } from '../policies/policies.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { AdminController } from './admin.controller.js';
import { AdminFailuresController } from './admin-failures.controller.js';

@Module({
  imports: [FailuresModule, TenantsModule, PoliciesModule],
  controllers: [AdminController, AdminFailuresController],
})
export class AdminModule {}
