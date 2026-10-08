import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { AlertsService } from './alerts.service.js';
import { UpdateAlertDto } from './dto/update-alert.dto.js';

@ApiTags('alert-rules')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/alert-rules')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  get(@TenantId() tenantId: string) {
    return this.alerts.get(tenantId);
  }

  @Put()
  update(@TenantId() tenantId: string, @Body() dto: UpdateAlertDto) {
    return this.alerts.update(tenantId, dto);
  }
}
