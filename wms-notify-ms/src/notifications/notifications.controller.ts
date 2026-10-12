import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateNotificationDto) {
    return this.notifications.create(tenantId, dto, 'tenant');
  }

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
  ) {
    return this.notifications.list(tenantId, {
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      userId,
    });
  }

  @Get('unread-count')
  async unreadCount(
    @TenantId() tenantId: string,
    @Query('userId') userId?: string,
  ) {
    const count = await this.notifications.countUnread(tenantId, userId);
    return { count };
  }

  @Post('read-all')
  markAllRead(@TenantId() tenantId: string, @Query('userId') userId?: string) {
    return this.notifications.markAllRead(tenantId, userId, 'tenant');
  }

  @Post(':id/read')
  markRead(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.notifications.markRead(tenantId, id, 'tenant');
  }
}
