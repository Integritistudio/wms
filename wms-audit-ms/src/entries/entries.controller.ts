import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { BulkCreateDto } from './dto/bulk-create.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { EntriesService } from './entries.service.js';

@ApiTags('entries')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/entries')
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Post()
  append(@TenantId() tenantId: string, @Body() dto: CreateEntryDto) {
    return this.entries.append(tenantId, dto);
  }

  @Post('bulk')
  bulk(@TenantId() tenantId: string, @Body() dto: BulkCreateDto) {
    return this.entries.appendBulk(tenantId, dto.entries);
  }

  @Get()
  query(
    @TenantId() tenantId: string,
    @Query('type') type?: string,
    @Query('orderId') orderId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('actor') actor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.entries.query(tenantId, {
      type,
      orderId,
      warehouseId,
      actor,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
