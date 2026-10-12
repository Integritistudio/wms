import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { ConnectionsService } from './connections.service.js';
import { UpsertConnectionDto } from './dto/upsert-connection.dto.js';

@ApiTags('connections')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.connections.list(tenantId);
  }

  @Put()
  upsert(@TenantId() tenantId: string, @Body() dto: UpsertConnectionDto) {
    return this.connections.upsert(tenantId, dto);
  }

  @Get(':id')
  async get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.connections.toPublic(await this.connections.get(tenantId, id));
  }

  @Post(':id/test')
  test(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.connections.test(tenantId, id);
  }
}
