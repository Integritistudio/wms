import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import {
  AuditAction,
  FailureResolution,
  FailureStatus,
} from '../common/enums.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { FailedItem } from '../database/entities/failed-item.entity.js';
import { RetryPolicy } from '../database/entities/retry-policy.entity.js';
import { LinkerCallbackClient } from '../linker/linker-callback.client.js';
import { computeNextRetryAt } from './backoff.util.js';
import { AckDto, BulkActionDto } from './dto/action.dto.js';
import { IngestFailureDto } from './dto/ingest-failure.dto.js';
import { ListFailuresQueryDto } from './dto/list-failures.query.dto.js';
import { toPublicFailure } from './failures.mapper.js';

@Injectable()
export class FailuresService {
  private readonly logger = new Logger(FailuresService.name);

  constructor(
    @InjectRepository(FailedItem)
    private readonly itemsRepo: Repository<FailedItem>,
    @InjectRepository(RetryPolicy)
    private readonly policiesRepo: Repository<RetryPolicy>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
    private readonly linker: LinkerCallbackClient,
    private readonly config: ConfigService,
  ) {}

  private async audit(input: {
    tenantId: string;
    failedItemId?: string | null;
    action: AuditAction;
    actor?: string;
    success?: boolean;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId: input.tenantId,
        failedItemId: input.failedItemId ?? null,
        action: input.action,
        actor: input.actor ?? 'system',
        success: input.success !== false,
        detail: input.detail ?? {},
      }),
    );
  }

  private async getPolicy(tenantId: string): Promise<RetryPolicy | null> {
    return this.policiesRepo.findOne({ where: { tenantId } });
  }

  async ingest(tenantId: string, dto: IngestFailureDto) {
    const policy = await this.getPolicy(tenantId);
    const maxAttempts =
      policy?.maxAttempts ?? this.config.get<number>('defaults.maxAttempts') ?? 5;
    const baseDelay =
      policy?.baseDelaySeconds ??
      this.config.get<number>('defaults.baseDelaySeconds') ??
      30;
    const maxDelay =
      policy?.maxDelaySeconds ??
      this.config.get<number>('defaults.maxDelaySeconds') ??
      900;
    const multiplier =
      Number(policy?.multiplier ?? this.config.get<number>('defaults.multiplier') ?? 2);
    const jitter = policy?.jitter ?? true;
    const retryable = new Set(
      policy?.retryableReasons?.length
        ? policy.retryableReasons
        : [],
    );
    const autoEnabled =
      (policy?.enabled ?? true) &&
      (retryable.size === 0 || retryable.has(dto.reason));

    let existing = await this.itemsRepo.findOne({
      where: [
        { tenantId, externalOrderId: dto.orderId, status: FailureStatus.OPEN },
        { tenantId, externalOrderId: dto.orderId, status: FailureStatus.RETRYING },
      ],
    });

    if (existing) {
      existing.attempts += 1;
      existing.errorMessage = dto.errorMessage || existing.errorMessage;
      existing.reason = dto.reason;
      if (dto.warehouseId && !existing.externalWarehouseId) {
        existing.externalWarehouseId = dto.warehouseId;
      }
      if (dto.payload) {
        existing.payload = { ...existing.payload, ...dto.payload };
      }
      existing.status = FailureStatus.OPEN;
      if (autoEnabled && existing.attempts < existing.maxAttempts) {
        existing.autoRetryEnabled = true;
        existing.nextRetryAt = computeNextRetryAt({
          attempts: existing.attempts,
          baseDelaySeconds: baseDelay,
          maxDelaySeconds: maxDelay,
          multiplier,
          jitter,
        });
      } else {
        existing.autoRetryEnabled = false;
        existing.nextRetryAt = null;
      }
      existing = await this.itemsRepo.save(existing);
      await this.audit({
        tenantId,
        failedItemId: existing.id,
        action: AuditAction.INGEST,
        detail: { bump: true, attempts: existing.attempts, reason: dto.reason },
      });
      return toPublicFailure(existing);
    }

    const nextRetryAt =
      autoEnabled
        ? computeNextRetryAt({
            attempts: 1,
            baseDelaySeconds: baseDelay,
            maxDelaySeconds: maxDelay,
            multiplier,
            jitter,
          })
        : null;

    const created = await this.itemsRepo.save(
      this.itemsRepo.create({
        tenantId,
        externalOrderId: dto.orderId,
        externalShopId: dto.shopId,
        externalCompanyId: dto.companyId,
        externalWarehouseId: dto.warehouseId ?? null,
        reason: dto.reason,
        errorMessage: dto.errorMessage || '',
        payload: dto.payload ?? {},
        attempts: 1,
        maxAttempts,
        status: FailureStatus.OPEN,
        autoRetryEnabled: Boolean(autoEnabled),
        nextRetryAt,
      }),
    );

    await this.audit({
      tenantId,
      failedItemId: created.id,
      action: AuditAction.INGEST,
      detail: { reason: dto.reason },
    });
    this.logger.warn(
      { orderId: dto.orderId, reason: dto.reason },
      'DLQ entry created',
    );
    return toPublicFailure(created);
  }

  async list(tenantId: string, query: ListFailuresQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const qb = this.itemsRepo
      .createQueryBuilder('f')
      .where('f.tenant_id = :tenantId', { tenantId });

    if (query.resolved) {
      qb.andWhere('f.status = :resolved', { resolved: FailureStatus.RESOLVED });
    } else {
      qb.andWhere('f.status IN (:...openStatuses)', {
        openStatuses: [FailureStatus.OPEN, FailureStatus.RETRYING],
      });
    }

    if (query.reason) {
      qb.andWhere('f.reason = :reason', { reason: query.reason });
    }

    if (query.warehouseIds?.length) {
      qb.andWhere('f.external_warehouse_id IN (:...wids)', {
        wids: query.warehouseIds,
      });
    }

    if (query.q?.trim()) {
      qb.andWhere(
        '(f.reason ILIKE :q OR f.error_message ILIKE :q OR f.resolved_by ILIKE :q OR f.external_order_id ILIKE :q)',
        { q: `%${query.q.trim()}%` },
      );
    }

    qb.orderBy('f.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map(toPublicFailure),
      total,
      page,
      limit,
    };
  }

  async countOpen(tenantId: string, warehouseIds?: string[] | null) {
    const where: Record<string, unknown> = {
      tenantId,
      status: In([FailureStatus.OPEN, FailureStatus.RETRYING]),
    };
    if (warehouseIds?.length) {
      where.externalWarehouseId = In(warehouseIds);
    }
    return this.itemsRepo.count({ where: where as never });
  }

  async getById(tenantId: string, id: string) {
    const item = await this.itemsRepo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('DLQ entry not found');
    return item;
  }

  async getPublic(tenantId: string, id: string) {
    return toPublicFailure(await this.getById(tenantId, id));
  }

  async retry(tenantId: string, id: string, actor?: string, auto = false) {
    const item = await this.getById(tenantId, id);
    if (item.status === FailureStatus.RESOLVED || item.status === FailureStatus.DISCARDED) {
      throw new BadRequestException('Entry is already resolved');
    }

    item.status = FailureStatus.RETRYING;
    item.lastRetryAt = new Date();
    await this.itemsRepo.save(item);

    const result = await this.linker.execute({
      action: 'retry',
      orderId: item.externalOrderId,
      failureId: item.id,
      warehouseId: item.externalWarehouseId,
      actor: actor ?? (auto ? 'auto-retry' : 'manual'),
    });

    if (result.ok) {
      return this.markResolved(item, {
        resolution: auto ? FailureResolution.AUTO_RETRIED : FailureResolution.RETRIED,
        resolvedBy: actor ?? (auto ? 'auto-retry' : 'manual'),
        action: auto ? AuditAction.AUTO_RETRY : AuditAction.MANUAL_RETRY,
      });
    }

    await this.handleRetryFailure(item, result.message || 'Retry failed', actor, auto);
    throw new BadRequestException(result.message || 'Retry did not allocate the order');
  }

  async reassign(tenantId: string, id: string, warehouseId: string, actor?: string) {
    const item = await this.getById(tenantId, id);
    if (item.status === FailureStatus.RESOLVED) {
      throw new BadRequestException('Entry is already resolved');
    }

    item.status = FailureStatus.RETRYING;
    item.externalWarehouseId = warehouseId;
    item.lastRetryAt = new Date();
    await this.itemsRepo.save(item);

    const result = await this.linker.execute({
      action: 'reassign',
      orderId: item.externalOrderId,
      failureId: item.id,
      warehouseId,
      actor: actor ?? 'manual',
    });

    if (!result.ok) {
      item.status = FailureStatus.OPEN;
      item.errorMessage = result.message || item.errorMessage;
      await this.itemsRepo.save(item);
      await this.audit({
        tenantId,
        failedItemId: item.id,
        action: AuditAction.REASSIGN,
        actor,
        success: false,
        detail: { message: result.message, warehouseId },
      });
      throw new BadRequestException(result.message || 'Reassign failed');
    }

    return this.markResolved(item, {
      resolution: FailureResolution.REASSIGNED,
      resolvedBy: actor ?? 'manual',
      action: AuditAction.REASSIGN,
      detail: { warehouseId },
    });
  }

  async skip(tenantId: string, id: string, actor?: string) {
    const item = await this.getById(tenantId, id);
    return this.markResolved(item, {
      resolution: FailureResolution.SKIPPED,
      resolvedBy: actor ?? 'manual',
      action: AuditAction.SKIP,
    });
  }

  async addNote(tenantId: string, id: string, note: string, actor?: string) {
    const item = await this.getById(tenantId, id);
    item.note = note;
    await this.itemsRepo.save(item);
    await this.audit({
      tenantId,
      failedItemId: item.id,
      action: AuditAction.NOTE,
      actor,
      detail: { note },
    });
    return toPublicFailure(item);
  }

  async ack(tenantId: string, id: string, dto: AckDto) {
    const item = await this.getById(tenantId, id);
    if (dto.result === 'success') {
      const resolution =
        (dto.resolution as FailureResolution) ||
        (dto.auto ? FailureResolution.AUTO_RETRIED : FailureResolution.RETRIED);
      return this.markResolved(item, {
        resolution,
        resolvedBy: dto.actor ?? 'linker',
        action: dto.auto ? AuditAction.ACK_SUCCESS : AuditAction.ACK_SUCCESS,
      });
    }
    await this.handleRetryFailure(
      item,
      dto.message || 'Ack failure',
      dto.actor,
      Boolean(dto.auto),
    );
    return toPublicFailure(await this.getById(tenantId, id));
  }

  async bulk(tenantId: string, dto: BulkActionDto) {
    const results: Array<{ id: string; ok: boolean; message?: string }> = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'retry') {
          await this.retry(tenantId, id, dto.actor, false);
        } else {
          await this.skip(tenantId, id, dto.actor);
        }
        results.push({ id, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await this.audit({
      tenantId,
      action: dto.action === 'retry' ? AuditAction.BULK_RETRY : AuditAction.BULK_SKIP,
      actor: dto.actor,
      detail: { results },
    });
    return { results };
  }

  async pickDueForAutoRetry(limit: number): Promise<FailedItem[]> {
    const now = new Date();
    return this.itemsRepo.find({
      where: {
        status: FailureStatus.OPEN,
        autoRetryEnabled: true,
        nextRetryAt: LessThanOrEqual(now),
      },
      order: { nextRetryAt: 'ASC' },
      take: limit,
    });
  }

  async expireStale(olderThanHours: number): Promise<number> {
    if (olderThanHours <= 0) return 0;
    const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
    const stale = await this.itemsRepo
      .createQueryBuilder('f')
      .where('f.status IN (:...statuses)', {
        statuses: [FailureStatus.OPEN, FailureStatus.RETRYING],
      })
      .andWhere('f.created_at <= :cutoff', { cutoff })
      .getMany();

    for (const item of stale) {
      item.status = FailureStatus.DISCARDED;
      item.resolution = FailureResolution.EXPIRED;
      item.resolvedAt = new Date();
      item.resolvedBy = 'stale-sweeper';
      item.autoRetryEnabled = false;
      item.nextRetryAt = null;
      await this.itemsRepo.save(item);
      await this.audit({
        tenantId: item.tenantId,
        failedItemId: item.id,
        action: AuditAction.EXPIRE,
        detail: { olderThanHours },
      });
    }
    return stale.length;
  }

  async metricsSummary() {
    const open = await this.itemsRepo.count({
      where: { status: In([FailureStatus.OPEN, FailureStatus.RETRYING]) },
    });
    const byReason = await this.itemsRepo
      .createQueryBuilder('f')
      .select('f.reason', 'reason')
      .addSelect('COUNT(*)', 'count')
      .where('f.status IN (:...statuses)', {
        statuses: [FailureStatus.OPEN, FailureStatus.RETRYING],
      })
      .groupBy('f.reason')
      .getRawMany<{ reason: string; count: string }>();

    const oldest = await this.itemsRepo.findOne({
      where: { status: In([FailureStatus.OPEN, FailureStatus.RETRYING]) },
      order: { createdAt: 'ASC' },
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const resolved = await this.auditRepo.count({
      where: {
        action: In([AuditAction.MANUAL_RETRY, AuditAction.AUTO_RETRY, AuditAction.ACK_SUCCESS]),
        success: true,
        createdAt: LessThanOrEqual(new Date()) as never,
      },
    });
    const retryAttempts = await this.auditRepo
      .createQueryBuilder('a')
      .where('a.action IN (:...actions)', {
        actions: [AuditAction.MANUAL_RETRY, AuditAction.AUTO_RETRY],
      })
      .andWhere('a.created_at >= :weekAgo', { weekAgo })
      .getCount();
    const retrySuccesses = await this.auditRepo
      .createQueryBuilder('a')
      .where('a.action IN (:...actions)', {
        actions: [AuditAction.MANUAL_RETRY, AuditAction.AUTO_RETRY],
      })
      .andWhere('a.success = true')
      .andWhere('a.created_at >= :weekAgo', { weekAgo })
      .getCount();

    return {
      open,
      byReason: Object.fromEntries(byReason.map((r) => [r.reason, Number(r.count)])),
      oldestOpenAt: oldest?.createdAt ?? null,
      oldestOpenAgeMinutes: oldest
        ? Math.round((Date.now() - oldest.createdAt.getTime()) / 60000)
        : 0,
      retrySuccessRate7d:
        retryAttempts === 0 ? null : Number((retrySuccesses / retryAttempts).toFixed(3)),
      resolvedAuditSample: resolved,
    };
  }

  private async markResolved(
    item: FailedItem,
    opts: {
      resolution: FailureResolution;
      resolvedBy: string;
      action: AuditAction;
      detail?: Record<string, unknown>;
    },
  ) {
    item.status = FailureStatus.RESOLVED;
    item.resolution = opts.resolution;
    item.resolvedAt = new Date();
    item.resolvedBy = opts.resolvedBy;
    item.autoRetryEnabled = false;
    item.nextRetryAt = null;
    await this.itemsRepo.save(item);
    await this.audit({
      tenantId: item.tenantId,
      failedItemId: item.id,
      action: opts.action,
      actor: opts.resolvedBy,
      detail: opts.detail,
    });
    return toPublicFailure(item);
  }

  private async handleRetryFailure(
    item: FailedItem,
    message: string,
    actor?: string,
    auto = false,
  ): Promise<void> {
    const policy = await this.getPolicy(item.tenantId);
    const baseDelay =
      policy?.baseDelaySeconds ??
      this.config.get<number>('defaults.baseDelaySeconds') ??
      30;
    const maxDelay =
      policy?.maxDelaySeconds ??
      this.config.get<number>('defaults.maxDelaySeconds') ??
      900;
    const multiplier = Number(
      policy?.multiplier ?? this.config.get<number>('defaults.multiplier') ?? 2,
    );
    const jitter = policy?.jitter ?? true;

    item.attempts += 1;
    item.errorMessage = message;
    item.status = FailureStatus.OPEN;
    item.lastRetryAt = new Date();

    if (item.attempts >= item.maxAttempts || !(policy?.enabled ?? true)) {
      item.autoRetryEnabled = false;
      item.nextRetryAt = null;
    } else {
      item.autoRetryEnabled = auto || item.autoRetryEnabled;
      item.nextRetryAt = computeNextRetryAt({
        attempts: item.attempts,
        baseDelaySeconds: baseDelay,
        maxDelaySeconds: maxDelay,
        multiplier,
        jitter,
      });
    }

    await this.itemsRepo.save(item);
    await this.audit({
      tenantId: item.tenantId,
      failedItemId: item.id,
      action: auto ? AuditAction.AUTO_RETRY : AuditAction.ACK_FAILURE,
      actor: actor ?? (auto ? 'auto-retry' : 'system'),
      success: false,
      detail: { message, attempts: item.attempts, nextRetryAt: item.nextRetryAt },
    });
  }
}
