import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { EnqueueTransferDto } from './dto/enqueue-transfer.dto.js';
import { TransfersService } from './transfers.service.js';

@ApiTags('transfers')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  enqueue(@TenantId() tenantId: string, @Body() dto: EnqueueTransferDto) {
    return this.transfers.enqueue(tenantId, dto);
  }

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transfers.list(
      tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
    );
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.transfers.get(tenantId, id);
  }
}
