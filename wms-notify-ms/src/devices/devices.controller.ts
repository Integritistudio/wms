import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { DevicesService } from './devices.service.js';
import { UpsertDeviceDto } from './dto/upsert-device.dto.js';

@ApiTags('devices')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.devices.list(tenantId);
  }

  @Put()
  upsert(@TenantId() tenantId: string, @Body() dto: UpsertDeviceDto) {
    return this.devices.upsert(tenantId, dto, 'tenant');
  }

  @Delete(':id')
  disable(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.devices.disable(tenantId, id, 'tenant');
  }
}
