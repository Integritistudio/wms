import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpsertSmtpDto } from './dto/upsert-smtp.dto.js';
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

  @Post('ensure')
  ensure(
    @Body() body: { externalCompanyId: string; name?: string; slug?: string },
  ) {
    return this.tenants.ensureByExternalCompanyId(body);
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
  rotate(@Param('id') id: string, @Body() body: { label?: string }) {
    return this.tenants.rotateApiKey(id, body.label);
  }

  @Put(':id/smtp')
  upsertSmtp(@Param('id') id: string, @Body() dto: UpsertSmtpDto) {
    return this.tenants.upsertSmtp(id, dto);
  }

  @Get(':id/smtp')
  getSmtp(@Param('id') id: string) {
    return this.tenants.getSmtpPublic(id);
  }
}
