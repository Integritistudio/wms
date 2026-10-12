import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { UpsertTemplateDto } from './dto/upsert-template.dto.js';
import { TemplatesService } from './templates.service.js';

@ApiTags('templates')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.templates.list(tenantId);
  }

  @Get(':key')
  get(@TenantId() tenantId: string, @Param('key') key: string) {
    return this.templates.get(tenantId, key);
  }

  @Put()
  upsert(@TenantId() tenantId: string, @Body() dto: UpsertTemplateDto) {
    return this.templates.upsert(tenantId, dto);
  }
}
