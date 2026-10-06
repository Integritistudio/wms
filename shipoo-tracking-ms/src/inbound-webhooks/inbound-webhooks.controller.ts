import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CORRELATION_HEADER } from '../common/middleware/correlation.middleware.js';
import { InboundWebhooksService } from './inbound-webhooks.service.js';

@ApiTags('inbound-webhooks')
@Controller('v1/webhooks/shippo')
export class InboundWebhooksController {
  constructor(private readonly inbound: InboundWebhooksService) {}

  @Post('track-updated')
  trackUpdated(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const correlationId = req.headers[CORRELATION_HEADER];
    return this.inbound.handleShippoTrackUpdated(
      body,
      typeof correlationId === 'string' ? correlationId : undefined,
    );
  }
}
