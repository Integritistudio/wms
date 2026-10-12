import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { MailStatus } from '../common/enums.js';
import { EnqueueMailDto } from './dto/enqueue-mail.dto.js';
import { MailService } from './mail.service.js';

@ApiTags('mail')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Post()
  enqueue(@TenantId() tenantId: string, @Body() dto: EnqueueMailDto) {
    return this.mail.enqueue(tenantId, dto);
  }

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('status') status?: MailStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.mail.list(tenantId, {
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.mail.get(tenantId, id);
  }
}
