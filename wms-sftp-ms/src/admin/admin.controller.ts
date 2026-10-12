import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { UpsertConnectionDto } from '../connections/dto/upsert-connection.dto.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { EnqueueTransferDto } from '../transfers/dto/enqueue-transfer.dto.js';
import { TransfersService } from '../transfers/transfers.service.js';

@ApiTags('admin')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly connections: ConnectionsService,
    private readonly transfers: TransfersService,
  ) {}

  private async tenantId(companyId: string) {
    const { tenant } = await this.tenants.ensureByExternalCompanyId({
      externalCompanyId: companyId,
    });
    return tenant.id;
  }

  @Get('metrics/summary')
  metrics() {
    return this.transfers.metricsSummary();
  }

  @Put('connections')
  async upsertConnection(
    @Query('companyId') companyId: string,
    @Body() dto: UpsertConnectionDto,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.connections.upsert(tenantId, dto);
  }

  @Post('transfers')
  async enqueueTransfer(
    @Query('companyId') companyId: string,
    @Body() dto: EnqueueTransferDto,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.transfers.enqueue(tenantId, dto, 'admin');
  }
}
