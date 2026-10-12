import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { EnqueueMailDto } from '../mail/dto/enqueue-mail.dto.js';
import { MailService } from '../mail/mail.service.js';
import { TenantsService } from '../tenants/tenants.service.js';

@ApiTags('admin')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly mail: MailService,
    private readonly tenants: TenantsService,
  ) {}

  @Get('metrics/summary')
  metrics() {
    return this.mail.metricsSummary();
  }

  @Post('mail')
  async enqueue(
    @Query('companyId') companyId: string,
    @Body() dto: EnqueueMailDto,
  ) {
    const { tenant } = await this.tenants.ensureByExternalCompanyId({
      externalCompanyId: companyId,
    });
    return this.mail.enqueue(tenant.id, dto, 'admin');
  }
}
