import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { BulkCreateDto } from '../entries/dto/bulk-create.dto.js';
import { CreateEntryDto } from '../entries/dto/create-entry.dto.js';
import { EntriesService } from '../entries/entries.service.js';
import { TenantsService } from '../tenants/tenants.service.js';

@ApiTags('admin')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly entries: EntriesService,
  ) {}

  private async tenantId(companyId: string) {
    const { tenant } = await this.tenants.ensureByExternalCompanyId({
      externalCompanyId: companyId,
    });
    return tenant.id;
  }

  @Get('metrics/summary')
  metrics() {
    return this.entries.metricsSummary();
  }

  @Post('entries')
  async append(
    @Query('companyId') companyId: string,
    @Body() dto: CreateEntryDto,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.entries.append(tenantId, dto);
  }

  @Post('entries/bulk')
  async bulk(
    @Query('companyId') companyId: string,
    @Body() dto: BulkCreateDto,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.entries.appendBulk(tenantId, dto.entries);
  }

  @Get('entries')
  async query(
    @Query('companyId') companyId: string,
    @Query('type') type?: string,
    @Query('orderId') orderId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('actor') actor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = await this.tenantId(companyId);
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

  @Get('entries/by-order')
  async byOrder(
    @Query('companyId') companyId: string,
    @Query('orderId') orderId: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = await this.tenantId(companyId);
    const items = await this.entries.listForOrder(
      tenantId,
      orderId,
      limit ? Number(limit) : 100,
    );
    return { items };
  }

  @Post('purge')
  purge() {
    return this.entries.purgeExpired();
  }
}
