import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookDelivery } from '../database/entities/webhook-delivery.entity.js';
import { WebhookDestinationSubscription } from '../database/entities/webhook-destination-subscription.entity.js';
import { WebhookDestination } from '../database/entities/webhook-destination.entity.js';
import { OutboundWebhookDeliveryService } from './outbound-webhook.delivery.service.js';
import { OutboundWebhookDispatcher } from './outbound-webhook.dispatcher.js';
import { SsrfGuardService } from './ssrf-guard.service.js';
import { WebhookDestinationsController } from './webhook-destinations.controller.js';
import { WebhookDestinationsService } from './webhook-destinations.service.js';
import { WebhookSignerService } from './webhook-signer.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebhookDestination,
      WebhookDestinationSubscription,
      WebhookDelivery,
    ]),
  ],
  controllers: [WebhookDestinationsController],
  providers: [
    WebhookDestinationsService,
    OutboundWebhookDispatcher,
    OutboundWebhookDeliveryService,
    WebhookSignerService,
    SsrfGuardService,
  ],
  exports: [
    OutboundWebhookDispatcher,
    OutboundWebhookDeliveryService,
    WebhookSignerService,
    SsrfGuardService,
  ],
})
export class OutboundWebhooksModule {}
