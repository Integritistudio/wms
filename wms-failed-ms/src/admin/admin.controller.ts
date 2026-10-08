import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { FailuresService } from '../failures/failures.service.js';

@ApiTags('admin')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(private readonly failures: FailuresService) {}

  @Get('metrics/summary')
  metrics() {
    return this.failures.metricsSummary();
  }
}
