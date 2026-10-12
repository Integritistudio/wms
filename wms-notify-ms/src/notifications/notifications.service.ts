import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import {
  AuditAction,
  DeliveryStatus,
  JobQueue,
  PushStatus,
  normalizeNotificationType,
} from '../common/enums.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { Notification } from '../database/entities/notification.entity.js';
import { Preference } from '../database/entities/preference.entity.js';
import { PushDelivery } from '../database/entities/push-delivery.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(Preference)
    private readonly prefsRepo: Repository<Preference>,
    @InjectRepository(PushDelivery)
    private readonly deliveriesRepo: Repository<PushDelivery>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  toPublic(row: Notification) {
    return {
      id: row.id,
      _id: row.id,
      companyId: row.tenantId,
      userId: row.externalUserId,
      type: row.type,
      title: row.title,
      message: row.message,
      meta: row.meta || {},
      channels: row.channels || [],
      read: row.read,
      readAt: row.readAt,
      pushStatus: row.pushStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async resolvePrefs(
    tenantId: string,
    type: string,
    userId: string | null,
  ) {
    if (userId) {
      const userPref = await this.prefsRepo.findOne({
        where: { tenantId, externalUserId: userId, notificationType: type },
      });
      if (userPref) return userPref;
    }
    const tenantPref = await this.prefsRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.notification_type = :type', { type })
      .andWhere('p.external_user_id IS NULL')
      .getOne();
    return (
      tenantPref || {
        inApp: true,
        push: true,
        email: false,
      }
    );
  }

  async create(tenantId: string, dto: CreateNotificationDto, actor = 'system') {
    const type = normalizeNotificationType(dto.type);
    if (dto.idempotencyKey) {
      const existing = await this.notificationsRepo.findOne({
        where: { tenantId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.toPublic(existing);
    }

    const userId = dto.userId || null;
    const prefs = await this.resolvePrefs(tenantId, type, userId);
    const requested = new Set(
      (dto.channels?.length ? dto.channels : ['in_app', 'push']).map((c) =>
        String(c).toLowerCase(),
      ),
    );
    const channels: string[] = [];
    if (requested.has('in_app') && prefs.inApp) channels.push('in_app');
    if (requested.has('push') && prefs.push) channels.push('push');
    if (requested.has('email') && prefs.email) channels.push('email');
    if (!channels.length && prefs.inApp) channels.push('in_app');

    const notification = await this.notificationsRepo.save(
      this.notificationsRepo.create({
        tenantId,
        externalUserId: userId,
        type,
        title: dto.title,
        message: dto.message || '',
        meta: dto.meta || {},
        channels,
        pushStatus: channels.includes('push') ? PushStatus.QUEUED : PushStatus.NONE,
        idempotencyKey: dto.idempotencyKey || null,
      }),
    );

    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        notificationId: notification.id,
        action: AuditAction.NOTIFICATION_CREATE,
        actor,
        detail: { type, channels },
      }),
    );

    if (channels.includes('push')) {
      await this.enqueuePush(notification);
    }

    return this.toPublic(notification);
  }

  private async enqueuePush(notification: Notification) {
    const qb = this.devicesRepo
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId', { tenantId: notification.tenantId })
      .andWhere('d.enabled = true');
    if (notification.externalUserId) {
      qb.andWhere(
        '(d.external_user_id = :userId OR d.external_user_id IS NULL)',
        { userId: notification.externalUserId },
      );
    }
    const devices = await qb.getMany();
    if (!devices.length) {
      notification.pushStatus = PushStatus.SKIPPED;
      notification.pushLastError = 'No devices registered';
      await this.notificationsRepo.save(notification);
      return;
    }
    for (const device of devices) {
      const delivery = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          tenantId: notification.tenantId,
          notificationId: notification.id,
          deviceId: device.id,
          status: DeliveryStatus.QUEUED,
          scheduledAt: new Date(),
        }),
      );
      await this.jobs.enqueue(JobQueue.PUSH, { deliveryId: delivery.id }, {
        singletonKey: delivery.id,
      });
    }
  }

  async list(
    tenantId: string,
    opts: { unreadOnly?: boolean; page?: number; limit?: number; userId?: string } = {},
  ) {
    await this.purgeExpiredRead(tenantId).catch(() => undefined);
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 25));
    const where: Record<string, unknown> = { tenantId };
    if (opts.unreadOnly) where.read = false;
    if (opts.userId) where.externalUserId = opts.userId;

    const [items, total] = await this.notificationsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((i) => this.toPublic(i)),
      total,
      page,
      limit,
    };
  }

  async countUnread(tenantId: string, userId?: string) {
    const where: Record<string, unknown> = { tenantId, read: false };
    if (userId) where.externalUserId = userId;
    return this.notificationsRepo.count({ where });
  }

  async markRead(tenantId: string, id: string, actor = 'user') {
    const row = await this.notificationsRepo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Notification not found');
    row.read = true;
    row.readAt = new Date();
    await this.notificationsRepo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        notificationId: id,
        action: AuditAction.NOTIFICATION_READ,
        actor,
      }),
    );
    return this.toPublic(row);
  }

  async markAllRead(tenantId: string, userId?: string, actor = 'user') {
    const where: Record<string, unknown> = { tenantId, read: false };
    if (userId) where.externalUserId = userId;
    const result = await this.notificationsRepo.update(where, {
      read: true,
      readAt: new Date(),
    });
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.NOTIFICATION_READ_ALL,
        actor,
        detail: { affected: result.affected ?? 0 },
      }),
    );
    return { affected: result.affected ?? 0 };
  }

  async purgeExpiredRead(tenantId?: string) {
    const readDays = this.config.get<number>('retention.readDays') ?? 7;
    const ttlDays = this.config.get<number>('retention.ttlDays') ?? 90;
    const readCutoff = new Date(Date.now() - readDays * 86400_000);
    const ttlCutoff = new Date(Date.now() - ttlDays * 86400_000);

    const readQb = this.notificationsRepo
      .createQueryBuilder()
      .delete()
      .where('read = true')
      .andWhere('(read_at IS NOT NULL AND read_at <= :cut) OR (read_at IS NULL AND updated_at <= :cut)', {
        cut: readCutoff,
      });
    if (tenantId) readQb.andWhere('tenant_id = :tenantId', { tenantId });
    const readResult = await readQb.execute();

    const ttlQb = this.notificationsRepo
      .createQueryBuilder()
      .delete()
      .where('created_at <= :ttl', { ttl: ttlCutoff });
    if (tenantId) ttlQb.andWhere('tenant_id = :tenantId', { tenantId });
    const ttlResult = await ttlQb.execute();

    return {
      deletedRead: readResult.affected ?? 0,
      deletedTtl: ttlResult.affected ?? 0,
    };
  }

  async metricsSummary() {
    const [total, unread, pushQueued, pushFailed] = await Promise.all([
      this.notificationsRepo.count(),
      this.notificationsRepo.count({ where: { read: false } }),
      this.notificationsRepo.count({ where: { pushStatus: PushStatus.QUEUED } }),
      this.notificationsRepo.count({ where: { pushStatus: PushStatus.FAILED } }),
    ]);
    return { total, unread, pushQueued, pushFailed };
  }

  async processDelivery(deliveryId: string) {
    const delivery = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) return;
    if (
      delivery.status === DeliveryStatus.SENT ||
      delivery.status === DeliveryStatus.SKIPPED
    ) {
      return;
    }
    delivery.status = DeliveryStatus.RUNNING;
    delivery.attempts += 1;
    await this.deliveriesRepo.save(delivery);
    return delivery;
  }

  async completeDelivery(
    delivery: PushDelivery,
    ok: boolean,
    detail: Record<string, unknown>,
    error?: string,
  ) {
    delivery.status = ok ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
    delivery.completedAt = ok ? new Date() : null;
    delivery.lastError = error || null;
    delivery.providerResponse = detail;
    if (!ok) {
      const maxAttempts = this.config.get<number>('pgBoss.retryLimit') ?? 5;
      if (delivery.attempts < maxAttempts) {
        delivery.status = DeliveryStatus.QUEUED;
        delivery.scheduledAt = new Date(
          Date.now() +
            (this.config.get<number>('pgBoss.retryDelaySeconds') ?? 30) *
              1000 *
              Math.max(1, delivery.attempts),
        );
      }
    }
    await this.deliveriesRepo.save(delivery);

    const siblings = await this.deliveriesRepo.find({
      where: { notificationId: delivery.notificationId },
    });
    const notification = await this.notificationsRepo.findOne({
      where: { id: delivery.notificationId },
    });
    if (!notification) return;

    const anyQueued = siblings.some(
      (s) => s.status === DeliveryStatus.QUEUED || s.status === DeliveryStatus.RUNNING,
    );
    const anySent = siblings.some((s) => s.status === DeliveryStatus.SENT);
    const allFailed =
      siblings.length > 0 &&
      siblings.every((s) => s.status === DeliveryStatus.FAILED);

    if (anyQueued) {
      notification.pushStatus = PushStatus.QUEUED;
    } else if (anySent) {
      notification.pushStatus = PushStatus.SENT;
      notification.pushLastError = null;
    } else if (allFailed) {
      notification.pushStatus = PushStatus.FAILED;
      notification.pushLastError = error || 'All push deliveries failed';
    } else {
      notification.pushStatus = PushStatus.SKIPPED;
    }
    notification.pushAttempts = Math.max(
      notification.pushAttempts,
      delivery.attempts,
    );
    await this.notificationsRepo.save(notification);

    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId: delivery.tenantId,
        notificationId: delivery.notificationId,
        action: ok ? AuditAction.PUSH_OK : AuditAction.PUSH_FAIL,
        detail,
        success: ok,
      }),
    );
  }

  claimQueuedDeliveries(limit: number) {
    return this.deliveriesRepo.find({
      where: {
        status: In([DeliveryStatus.QUEUED]),
        scheduledAt: LessThanOrEqual(new Date()),
      },
      order: { scheduledAt: 'ASC' },
      take: limit,
    });
  }
}
