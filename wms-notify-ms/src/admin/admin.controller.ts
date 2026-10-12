import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { DevicesService } from '../devices/devices.service.js';
import { UpsertDeviceDto } from '../devices/dto/upsert-device.dto.js';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UpsertPreferenceDto } from '../preferences/dto/upsert-preference.dto.js';
import { PreferencesService } from '../preferences/preferences.service.js';
import { TenantsService } from '../tenants/tenants.service.js';

@ApiTags('admin')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly notifications: NotificationsService,
    private readonly devices: DevicesService,
    private readonly preferences: PreferencesService,
  ) {}

  private async tenantId(companyId: string) {
    const { tenant } = await this.tenants.ensureByExternalCompanyId({
      externalCompanyId: companyId,
    });
    return tenant.id;
  }

  @Get('metrics/summary')
  metrics() {
    return this.notifications.metricsSummary();
  }

  @Post('notifications')
  async create(
    @Query('companyId') companyId: string,
    @Body() dto: CreateNotificationDto,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.notifications.create(tenantId, dto, 'admin');
  }

  @Get('notifications')
  async list(
    @Query('companyId') companyId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.notifications.list(tenantId, {
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      userId,
    });
  }

  @Get('notifications/unread-count')
  async unreadCount(
    @Query('companyId') companyId: string,
    @Query('userId') userId?: string,
  ) {
    const tenantId = await this.tenantId(companyId);
    const count = await this.notifications.countUnread(tenantId, userId);
    return { count };
  }

  @Post('notifications/read-all')
  async markAllRead(
    @Query('companyId') companyId: string,
    @Query('userId') userId?: string,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.notifications.markAllRead(tenantId, userId, 'admin');
  }

  @Post('notifications/:id/read')
  async markRead(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.notifications.markRead(tenantId, id, 'admin');
  }

  @Put('devices')
  async upsertDevice(
    @Query('companyId') companyId: string,
    @Body() dto: UpsertDeviceDto,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.devices.upsert(tenantId, dto, 'admin');
  }

  @Get('devices')
  async listDevices(@Query('companyId') companyId: string) {
    const tenantId = await this.tenantId(companyId);
    return this.devices.list(tenantId);
  }

  @Delete('devices/:id')
  async disableDevice(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.devices.disable(tenantId, id, 'admin');
  }

  @Get('preferences')
  async listPrefs(
    @Query('companyId') companyId: string,
    @Query('userId') userId?: string,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.preferences.list(tenantId, userId);
  }

  @Put('preferences')
  async upsertPrefs(
    @Query('companyId') companyId: string,
    @Body() dto: UpsertPreferenceDto,
  ) {
    const tenantId = await this.tenantId(companyId);
    return this.preferences.upsert(tenantId, dto, 'admin');
  }
}
