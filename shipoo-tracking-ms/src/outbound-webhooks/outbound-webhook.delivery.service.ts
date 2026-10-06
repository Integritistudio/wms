import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEventType, WebhookDeliveryStatus } from '../common/enums.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { WebhookDelivery } from '../database/entities/webhook-delivery.entity.js';
import { WebhookDestination } from '../database/entities/webhook-destination.entity.js';
import { SsrfGuardService } from './ssrf-guard.service.js';
import { WebhookSignerService } from './webhook-signer.service.js';

export class OutboundDeliveryPermanentError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class OutboundDeliveryRetryableError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class OutboundWebhookDeliveryService {
  private readonly logger = new Logger(OutboundWebhookDeliveryService.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepo: Repository<WebhookDelivery>,
    @InjectRepository(WebhookDestination)
    private readonly destinationsRepo: Repository<WebhookDestination>,
    private readonly encryption: EncryptionService,
    private readonly signer: WebhookSignerService,
    private readonly ssrf: SsrfGuardService,
    private readonly config: ConfigService,
  ) {}

  async deliver(payload: {
    deliveryId: string | null;
    domainEventId: string;
    destinationId: string;
    tenantId: string;
    eventType: DomainEventType;
    payload: Record<string, unknown>;
    correlationId?: string;
    direct?: boolean;
  }): Promise<void> {
    const destination = await this.destinationsRepo.findOne({
      where: { id: payload.destinationId, tenantId: payload.tenantId },
    });
    if (!destination || !destination.enabled) {
      throw new OutboundDeliveryPermanentError('Destination not found');
    }

    let delivery =
      payload.deliveryId &&
      (await this.deliveriesRepo.findOne({
        where: { id: payload.deliveryId, tenantId: payload.tenantId },
      }));
    if (!delivery && !payload.direct) {
      throw new OutboundDeliveryPermanentError('Delivery not found');
    }
    if (delivery) {
      delivery.attemptCount += 1;
      await this.deliveriesRepo.save(delivery);
    }

    let url: URL;
    try {
      url = await this.ssrf.assertSafeUrl(destination.url);
    } catch (err) {
      if (delivery) {
        await this.markDead(delivery, err instanceof Error ? err.message : 'SSRF blocked');
      }
      throw new OutboundDeliveryPermanentError('SSRF blocked');
    }

    const secret = this.encryption.decrypt(destination.secretCiphertext);
    const body = JSON.stringify({
      id: payload.domainEventId,
      type: payload.eventType,
      createdAt: new Date().toISOString(),
      data: payload.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.signer.sign(secret, timestamp, body);
    const timeoutMs = this.config.get<number>('outboundWebhook.timeoutMs') ?? 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': payload.domainEventId,
          'X-Webhook-Timestamp': String(timestamp),
          'X-Webhook-Signature': signature,
          ...(payload.correlationId
            ? { 'X-Request-Id': payload.correlationId }
            : {}),
        },
        body,
        signal: controller.signal,
      });
      if (delivery) {
        delivery.lastHttpStatus = res.status;
      }
      if (res.ok) {
        if (delivery) {
          delivery.status = WebhookDeliveryStatus.SUCCESS;
          delivery.completedAt = new Date();
          delivery.lastError = null;
          await this.deliveriesRepo.save(delivery);
        }
        return;
      }
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
        if (delivery) {
          await this.markDead(delivery, `HTTP ${res.status}`);
        }
        throw new OutboundDeliveryPermanentError(`HTTP ${res.status}`);
      }
      if (res.status === 429 || res.status >= 500) {
        if (delivery) {
          await this.markFailed(delivery, `HTTP ${res.status}`);
        }
        throw new OutboundDeliveryRetryableError(`HTTP ${res.status}`, res.status);
      }
      if (delivery) {
        await this.markDead(delivery, `HTTP ${res.status}`);
      }
      throw new OutboundDeliveryPermanentError(`HTTP ${res.status}`);
    } catch (err) {
      if (err instanceof OutboundDeliveryPermanentError || err instanceof OutboundDeliveryRetryableError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Delivery failed';
      if (delivery) {
        await this.markFailed(delivery, message);
      }
      throw new OutboundDeliveryRetryableError(message);
    } finally {
      clearTimeout(timer);
    }
  }

  private async markFailed(delivery: WebhookDelivery, error: string): Promise<void> {
    delivery.status = WebhookDeliveryStatus.FAILED;
    delivery.lastError = error;
    delivery.nextRetryAt = new Date(Date.now() + 60_000);
    await this.deliveriesRepo.save(delivery);
  }

  private async markDead(delivery: WebhookDelivery, error: string): Promise<void> {
    delivery.status = WebhookDeliveryStatus.DEAD;
    delivery.lastError = error;
    delivery.completedAt = new Date();
    await this.deliveriesRepo.save(delivery);
    this.logger.warn(
      JSON.stringify({
        msg: 'outbound_delivery_dead',
        deliveryId: delivery.id,
        error,
      }),
    );
  }
}
