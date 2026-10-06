import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { DomainEventType, JobQueue } from '../common/enums.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { WebhookDestinationSubscription } from '../database/entities/webhook-destination-subscription.entity.js';
import { WebhookDestination } from '../database/entities/webhook-destination.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { SsrfGuardService } from './ssrf-guard.service.js';
import { WebhookSignerService } from './webhook-signer.service.js';
import { CreateWebhookDestinationDto } from './dto/create-destination.dto.js';

@Injectable()
export class WebhookDestinationsService {
  constructor(
    @InjectRepository(WebhookDestination)
    private readonly destinationsRepo: Repository<WebhookDestination>,
    @InjectRepository(WebhookDestinationSubscription)
    private readonly subscriptionsRepo: Repository<WebhookDestinationSubscription>,
    private readonly encryption: EncryptionService,
    private readonly ssrf: SsrfGuardService,
    private readonly signer: WebhookSignerService,
    private readonly jobs: JobsService,
  ) {}

  async create(tenantId: string, dto: CreateWebhookDestinationDto) {
    await this.ssrf.assertSafeUrl(dto.url);
    const secret = randomBytes(32).toString('base64url');
    const destination = await this.destinationsRepo.save(
      this.destinationsRepo.create({
        tenantId,
        url: dto.url,
        description: dto.description ?? null,
        secretCiphertext: this.encryption.encrypt(secret),
        secretPrefix: secret.slice(0, 8),
        enabled: true,
      }),
    );
    for (const eventType of dto.eventTypes) {
      await this.subscriptionsRepo.save(
        this.subscriptionsRepo.create({ destinationId: destination.id, eventType }),
      );
    }
    return { destination, secret };
  }

  async list(tenantId: string) {
    const destinations = await this.destinationsRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    const withSubs = await Promise.all(
      destinations.map(async (destination) => ({
        ...destination,
        subscriptions: await this.subscriptionsRepo.find({
          where: { destinationId: destination.id },
        }),
      })),
    );
    return withSubs;
  }

  async get(tenantId: string, id: string) {
    const destination = await this.destinationsRepo.findOne({
      where: { id, tenantId },
    });
    if (!destination) {
      throw new NotFoundException('Webhook destination not found');
    }
    const subscriptions = await this.subscriptionsRepo.find({
      where: { destinationId: destination.id },
    });
    Object.assign(destination, { subscriptions });
    return destination as WebhookDestination & {
      subscriptions: WebhookDestinationSubscription[];
    };
  }

  async updateEnabled(tenantId: string, id: string, enabled: boolean) {
    const destination = await this.destinationsRepo.findOne({
      where: { id, tenantId },
    });
    if (!destination) {
      throw new NotFoundException('Webhook destination not found');
    }
    destination.enabled = enabled;
    return this.destinationsRepo.save(destination);
  }

  async delete(tenantId: string, id: string) {
    const destination = await this.get(tenantId, id);
    await this.destinationsRepo.remove(destination);
  }

  async updateSubscriptions(
    tenantId: string,
    id: string,
    eventTypes: DomainEventType[],
  ) {
    await this.get(tenantId, id);
    await this.subscriptionsRepo.delete({ destinationId: id });
    for (const eventType of eventTypes) {
      await this.subscriptionsRepo.save(
        this.subscriptionsRepo.create({ destinationId: id, eventType }),
      );
    }
    return this.get(tenantId, id);
  }

  async rotateSecret(tenantId: string, id: string) {
    const destination = await this.destinationsRepo.findOne({
      where: { id, tenantId },
    });
    if (!destination) {
      throw new NotFoundException('Webhook destination not found');
    }
    const secret = randomBytes(32).toString('base64url');
    destination.secretCiphertext = this.encryption.encrypt(secret);
    destination.secretPrefix = secret.slice(0, 8);
    await this.destinationsRepo.save(destination);
    return { secret, secretPrefix: destination.secretPrefix };
  }

  async sendTest(tenantId: string, id: string, correlationId?: string) {
    const destination = await this.get(tenantId, id);
    const secret = this.encryption.decrypt(destination.secretCiphertext);
    const eventId = randomBytes(16).toString('hex');
    const body = JSON.stringify({
      id: eventId,
      type: 'tracking.updated',
      createdAt: new Date().toISOString(),
      data: { test: true, tenantId },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.signer.sign(secret, timestamp, body);
    await this.jobs.enqueue(JobQueue.OUTBOUND_WEBHOOK_DELIVER, {
      deliveryId: null,
      domainEventId: eventId,
      destinationId: destination.id,
      tenantId,
      eventType: DomainEventType.TRACKING_UPDATED,
      payload: { test: true },
      correlationId,
      direct: true,
    });
    return {
      queued: true,
      headers: {
        'X-Webhook-Id': eventId,
        'X-Webhook-Timestamp': timestamp,
        'X-Webhook-Signature': signature,
      },
    };
  }
}
