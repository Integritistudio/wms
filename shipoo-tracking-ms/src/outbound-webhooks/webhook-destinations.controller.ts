import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { DomainEventType } from '../common/enums.js';
import { CORRELATION_HEADER } from '../common/middleware/correlation.middleware.js';
import { CreateWebhookDestinationDto } from './dto/create-destination.dto.js';
import { WebhookDestinationsService } from './webhook-destinations.service.js';

@ApiTags('webhook-destinations')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/webhook-destinations')
export class WebhookDestinationsController {
  constructor(private readonly destinations: WebhookDestinationsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateWebhookDestinationDto) {
    return this.destinations.create(tenantId, dto);
  }

  @Get()
  list(@TenantId() tenantId: string) {
    return this.destinations.list(tenantId);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.destinations.get(tenantId, id);
  }

  @Patch(':id/enabled')
  setEnabled(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.destinations.updateEnabled(tenantId, id, body.enabled);
  }

  @Patch(':id/subscriptions')
  setSubscriptions(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { eventTypes: DomainEventType[] },
  ) {
    return this.destinations.updateSubscriptions(tenantId, id, body.eventTypes);
  }

  @Post(':id/rotate-secret')
  rotate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.destinations.rotateSecret(tenantId, id);
  }

  @Post(':id/test')
  test(@TenantId() tenantId: string, @Param('id') id: string, @Req() req: Request) {
    const correlationId = req.headers[CORRELATION_HEADER];
    return this.destinations.sendTest(
      tenantId,
      id,
      typeof correlationId === 'string' ? correlationId : undefined,
    );
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.destinations.delete(tenantId, id);
  }
}
