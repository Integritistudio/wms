import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainEvent } from '../database/entities/domain-event.entity.js';
import { WebhookDelivery } from '../database/entities/webhook-delivery.entity.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookDelivery, DomainEvent]),
    MetricsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
