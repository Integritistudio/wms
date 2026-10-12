import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeEntryType } from '../common/enums.js';
import { AuditEntry } from '../database/entities/audit-entry.entity.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';

export interface QueryEntriesOpts {
  type?: string;
  orderId?: string;
  warehouseId?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class EntriesService {
  constructor(
    @InjectRepository(AuditEntry)
    private readonly entriesRepo: Repository<AuditEntry>,
    private readonly config: ConfigService,
  ) {}

  toPublic(row: AuditEntry) {
    return {
      id: row.id,
      type: row.type,
      actor: row.actor,
      orderId: row.orderId,
      warehouseId: row.warehouseId,
      userId: row.externalUserId,
      companyId: row.tenantId,
      fromState: row.fromState,
      toState: row.toState,
      message: row.message,
      meta: row.meta || {},
      correlationId: row.correlationId,
      createdAt: row.createdAt,
    };
  }

  private mapDto(tenantId: string, dto: CreateEntryDto): Partial<AuditEntry> {
    return {
      tenantId,
      type: normalizeEntryType(dto.type),
      actor: dto.actor || 'system',
      orderId: dto.orderId || null,
      warehouseId: dto.warehouseId || null,
      externalUserId: dto.userId || null,
      fromState: dto.fromState || '',
      toState: dto.toState || '',
      message: dto.message || '',
      meta: dto.meta || {},
      correlationId: dto.correlationId || null,
    };
  }

  async append(tenantId: string, dto: CreateEntryDto) {
    const saved = await this.entriesRepo.save(
      this.entriesRepo.create(this.mapDto(tenantId, dto)),
    );
    return this.toPublic(saved);
  }

  async appendBulk(tenantId: string, entries: CreateEntryDto[]) {
    const max = this.config.get<number>('maxBulkEntries') ?? 100;
    if (!entries?.length) throw new BadRequestException('entries required');
    if (entries.length > max) {
      throw new BadRequestException(`Max ${max} entries per bulk request`);
    }
    const rows = entries.map((e) => this.entriesRepo.create(this.mapDto(tenantId, e)));
    const saved = await this.entriesRepo.save(rows);
    return { count: saved.length, items: saved.map((r) => this.toPublic(r)) };
  }

  async query(tenantId: string, opts: QueryEntriesOpts = {}) {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
    const qb = this.entriesRepo
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId', { tenantId })
      .orderBy('e.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (opts.type) qb.andWhere('e.type = :type', { type: opts.type });
    if (opts.orderId) qb.andWhere('e.order_id = :orderId', { orderId: opts.orderId });
    if (opts.warehouseId) {
      qb.andWhere('e.warehouse_id = :warehouseId', { warehouseId: opts.warehouseId });
    }
    if (opts.actor) qb.andWhere('e.actor = :actor', { actor: opts.actor });
    if (opts.from) qb.andWhere('e.created_at >= :from', { from: new Date(opts.from) });
    if (opts.to) qb.andWhere('e.created_at <= :to', { to: new Date(opts.to) });

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((i) => this.toPublic(i)),
      total,
      page,
      limit,
    };
  }

  async listForOrder(tenantId: string, orderId: string, limit = 100) {
    const items = await this.entriesRepo.find({
      where: { tenantId, orderId },
      order: { createdAt: 'DESC' },
      take: Math.min(200, Math.max(1, limit)),
    });
    return items.map((i) => this.toPublic(i));
  }

  async metricsSummary() {
    const total = await this.entriesRepo.count();
    const byType = await this.entriesRepo
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.type')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany();
    return {
      total,
      byType: byType.map((r) => ({ type: r.type, count: Number(r.count) })),
    };
  }

  async purgeExpired() {
    const days = this.config.get<number>('retentionDays') ?? 30;
    const cutoff = new Date(Date.now() - days * 86400_000);
    const result = await this.entriesRepo
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();
    return { deleted: result.affected ?? 0, cutoff };
  }
}
