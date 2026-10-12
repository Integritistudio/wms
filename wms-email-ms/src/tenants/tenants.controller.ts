import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { UpsertSmtpDto } from './dto/upsert-smtp.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('smtp')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/smtp')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  get(@TenantId() tenantId: string) {
    return this.tenants.getSmtpPublic(tenantId);
  }

  @Put()
  upsert(@TenantId() tenantId: string, @Body() dto: UpsertSmtpDto) {
    return this.tenants.upsertSmtp(tenantId, dto);
  }
}
