import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { SetShippoCredentialDto } from './dto/set-shippo-credential.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('admin-tenants')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin/tenants')
export class TenantsAdminController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.createTenant(dto);
  }

  @Get()
  list() {
    return this.tenants.listTenants();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tenants.getTenant(id);
  }

  @Post(':id/api-keys')
  rotateKey(@Param('id') id: string, @Body() body: { label?: string }) {
    return this.tenants.rotateTenantApiKey(id, body.label);
  }

  @Post(':id/shippo-credentials')
  setShippo(@Param('id') id: string, @Body() dto: SetShippoCredentialDto) {
    return this.tenants.setShippoCredential(id, dto.shippoApiToken);
  }
}
