import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { CORRELATION_HEADER } from '../common/middleware/correlation.middleware.js';
import { ListTrackingQueryDto } from './dto/list-tracking.query.dto.js';
import { RegisterTrackingDto } from './dto/register-tracking.dto.js';
import { TrackingService } from './tracking.service.js';

@ApiTags('tracking')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post()
  register(
    @TenantId() tenantId: string,
    @Body() dto: RegisterTrackingDto,
    @Req() req: Request,
  ) {
    const correlationId = req.headers[CORRELATION_HEADER];
    return this.tracking.register(
      tenantId,
      dto,
      typeof correlationId === 'string' ? correlationId : undefined,
    );
  }

  @Get()
  list(@TenantId() tenantId: string, @Query() query: ListTrackingQueryDto) {
    return this.tracking.list(tenantId, query);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.tracking.getById(tenantId, id);
  }

  @Get(':id/history')
  history(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tracking.history(tenantId, id, page ? Number(page) : 1, limit ? Number(limit) : 50);
  }

  @Post(':id/refresh')
  refresh(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const correlationId = req.headers[CORRELATION_HEADER];
    return this.tracking.refresh(
      tenantId,
      id,
      typeof correlationId === 'string' ? correlationId : undefined,
    );
  }
}
