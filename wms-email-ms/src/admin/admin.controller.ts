import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { MailStatus } from '../common/enums.js';
import { EnqueueMailDto } from '../mail/dto/enqueue-mail.dto.js';
import { MailService } from '../mail/mail.service.js';
import { TestSmtpDto } from '../mail/dto/test-smtp.dto.js';
import { UpsertSmtpDto } from '../tenants/dto/upsert-smtp.dto.js';
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

  private async tenantForCompany(companyId: string) {
    const { tenant } = await this.tenants.ensureByExternalCompanyId({
      externalCompanyId: companyId,
    });
    return tenant;
  }

  @Get('metrics/summary')
  metrics() {
    return this.mail.metricsSummary();
  }

  @Post('mail')
  async enqueue(
    @Query('companyId') companyId: string,
    @Body() dto: EnqueueMailDto,
  ) {
    const tenant = await this.tenantForCompany(companyId);
    return this.mail.enqueue(tenant.id, dto, 'admin');
  }

  @Get('mail')
  async listMail(
    @Query('companyId') companyId: string,
    @Query('status') status?: MailStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenant = await this.tenantForCompany(companyId);
    return this.mail.list(tenant.id, {
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('mail/:id')
  async getMail(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    const tenant = await this.tenantForCompany(companyId);
    return this.mail.get(tenant.id, id);
  }

  @Get('smtp')
  async getSmtp(@Query('companyId') companyId: string) {
    const tenant = await this.tenantForCompany(companyId);
    const smtp = await this.tenants.getSmtpPublic(tenant.id);
    return {
      tenant: {
        id: tenant.id,
        allowPlatformSmtpFallback: tenant.allowPlatformSmtpFallback !== false,
      },
      smtp,
    };
  }

  @Post('smtp/test')
  async testSmtp(
    @Query('companyId') companyId: string,
    @Body() dto: TestSmtpDto,
  ) {
    if (!companyId?.trim()) {
      throw new BadRequestException('companyId is required');
    }
    const tenant = await this.tenantForCompany(companyId.trim());
    return this.mail.sendSmtpTest(tenant.id, dto);
  }

  @Put('smtp')
  async upsertSmtp(
    @Query('companyId') companyId: string,
    @Body() dto: UpsertSmtpDto,
  ) {
    const tenant = await this.tenantForCompany(companyId);
    return this.tenants.upsertSmtp(tenant.id, dto);
  }

  @Patch('tenant/fallback')
  async setFallback(
    @Query('companyId') companyId: string,
    @Body() body: { allowPlatformSmtpFallback: boolean },
  ) {
    const tenant = await this.tenantForCompany(companyId);
    const saved = await this.tenants.setAllowPlatformSmtpFallback(
      tenant.id,
      Boolean(body.allowPlatformSmtpFallback),
    );
    return {
      id: saved.id,
      allowPlatformSmtpFallback: saved.allowPlatformSmtpFallback,
    };
  }
}
