import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { UpsertPollerDto } from './dto/upsert-poller.dto.js';
import { PollersService } from './pollers.service.js';

@ApiTags('pollers')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/pollers')
export class PollersController {
  constructor(private readonly pollers: PollersService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.pollers.list(tenantId);
  }

  @Put()
  upsert(@TenantId() tenantId: string, @Body() dto: UpsertPollerDto) {
    return this.pollers.upsert(tenantId, dto);
  }
}
