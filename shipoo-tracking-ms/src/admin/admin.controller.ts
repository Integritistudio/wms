import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { WebhookDeliveryStatus } from '../common/enums.js';
import { AdminService } from './admin.service.js';

@ApiTags('admin')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('failed-deliveries')
  listFailed(
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('limit') limit?: number,
  ) {
    return this.admin.listDeliveries(status ?? WebhookDeliveryStatus.DEAD, limit ? Number(limit) : 50);
  }

  @Post('failed-deliveries/:id/retry')
  retryDelivery(@Param('id') id: string) {
    return this.admin.retryDelivery(id);
  }

  @Get('metrics/summary')
  metrics() {
    return this.admin.metricsSummary();
  }
}
