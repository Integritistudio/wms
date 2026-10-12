import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobQueue } from '../common/enums.js';
import { Device } from '../database/entities/device.entity.js';
import { Notification } from '../database/entities/notification.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PushProvider } from '../push/push.provider.js';

@Injectable()
export class PushWorker implements OnModuleInit {
  private readonly logger = new Logger(PushWorker.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly push: PushProvider,
    private readonly config: ConfigService,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.work<{ deliveryId: string }>(JobQueue.PUSH, async (job) => {
      await this.handleDelivery(job.data.deliveryId);
    });

    await this.jobs.work(JobQueue.PUSH_TICK, async () => {
      const batch = this.config.get<number>('push.batchSize') ?? 50;
      const queued = await this.notifications.claimQueuedDeliveries(batch);
      for (const d of queued) {
        await this.jobs.enqueue(JobQueue.PUSH, { deliveryId: d.id }, {
          singletonKey: d.id,
        });
      }
    });

    await this.jobs.work(JobQueue.PURGE_TICK, async () => {
      const result = await this.notifications.purgeExpiredRead();
      this.logger.log(
        `Purged read=${result.deletedRead} ttl=${result.deletedTtl}`,
      );
    });

    const poll = this.config.get<number>('push.pollSeconds') ?? 5;
    // Fire ticks via interval enqueue (pg-boss schedule cron is optional)
    setInterval(() => {
      void this.jobs.enqueue(JobQueue.PUSH_TICK, {}, { singletonKey: 'tick' });
    }, poll * 1000);

    setInterval(
      () => {
        void this.jobs.enqueue(JobQueue.PURGE_TICK, {}, { singletonKey: 'purge' });
      },
      60 * 60 * 1000,
    );

    this.logger.log('Push worker ready');
  }

  private async handleDelivery(deliveryId: string) {
    const delivery = await this.notifications.processDelivery(deliveryId);
    if (!delivery || !delivery.deviceId) return;

    const [device, notification] = await Promise.all([
      this.devicesRepo.findOne({ where: { id: delivery.deviceId } }),
      this.notificationsRepo.findOne({ where: { id: delivery.notificationId } }),
    ]);
    if (!device || !device.enabled) {
      await this.notifications.completeDelivery(
        delivery,
        false,
        { reason: 'device_missing' },
        'Device missing or disabled',
      );
      return;
    }
    if (!notification) {
      await this.notifications.completeDelivery(
        delivery,
        false,
        { reason: 'notification_missing' },
        'Notification missing',
      );
      return;
    }

    const result = await this.push.send(device, notification);
    if (result.disableDevice) {
      device.enabled = false;
      await this.devicesRepo.save(device);
    }
    await this.notifications.completeDelivery(
      delivery,
      result.ok,
      { provider: result.provider, ...result.detail },
      result.error,
    );
    if (!result.ok && delivery.status === 'queued') {
      await this.jobs.enqueue(
        JobQueue.PUSH,
        { deliveryId: delivery.id },
        { singletonKey: delivery.id, startAfter: delivery.scheduledAt },
      );
    }
  }
}
