import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { UpsertPreferenceDto } from './dto/upsert-preference.dto.js';
import { PreferencesService } from './preferences.service.js';

@ApiTags('preferences')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query('userId') userId?: string) {
    return this.preferences.list(tenantId, userId);
  }

  @Put()
  upsert(@TenantId() tenantId: string, @Body() dto: UpsertPreferenceDto) {
    return this.preferences.upsert(tenantId, dto, 'tenant');
  }
}
