import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboundProviderEvent } from '../database/entities/inbound-provider-event.entity.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { InboundWebhooksController } from './inbound-webhooks.controller.js';
import { InboundWebhooksService } from './inbound-webhooks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([InboundProviderEvent]),
    ProvidersModule,
  ],
  controllers: [InboundWebhooksController],
  providers: [InboundWebhooksService],
  exports: [InboundWebhooksService],
})
export class InboundWebhooksModule {}
