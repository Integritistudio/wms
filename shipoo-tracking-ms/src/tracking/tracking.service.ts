import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobQueue, NormalizedTrackingStatus } from '../common/enums.js';
import { TrackingRecord } from '../database/entities/tracking-record.entity.js';
import { TrackingEventHistory } from '../database/entities/tracking-event-history.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { TRACKING_PROVIDER } from '../providers/tracking/tracking-provider.interface.js';
import { ShippoTrackingProvider } from '../providers/shippo/shippo-tracking.provider.js';
import { ShippoHttpError } from '../providers/shippo/shippo-http.client.js';
import { TrackingEventProcessor } from './tracking-event.processor.js';
import { ListTrackingQueryDto } from './dto/list-tracking.query.dto.js';
import { RegisterTrackingDto } from './dto/register-tracking.dto.js';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(TrackingRecord)
    private readonly recordsRepo: Repository<TrackingRecord>,
    @InjectRepository(TrackingEventHistory)
    private readonly historyRepo: Repository<TrackingEventHistory>,
    @Inject(TRACKING_PROVIDER)
    private readonly provider: ShippoTrackingProvider,
    private readonly processor: TrackingEventProcessor,
    private readonly jobs: JobsService,
  ) {}

  async register(
    tenantId: string,
    dto: RegisterTrackingDto,
    correlationId?: string,
  ): Promise<TrackingRecord> {
    const normalizedCarrier = dto.carrier.trim().toLowerCase();
    const normalizedNumber = dto.trackingNumber.trim();

    let record = await this.recordsRepo.findOne({
      where: {
        tenantId,
        externalShipmentId: dto.externalShipmentId,
      },
    });
    if (
      record &&
      (record.carrier !== normalizedCarrier ||
        record.trackingNumber !== normalizedNumber)
    ) {
      throw new ConflictException(
        'externalShipmentId already registered with different carrier/tracking number',
      );
    }
    if (!record) {
      record = await this.recordsRepo.findOne({
        where: {
          tenantId,
          carrier: normalizedCarrier,
          trackingNumber: normalizedNumber,
        },
      });
    }
    const isNew = !record;
    if (!record) {
      record = this.recordsRepo.create({
        tenantId,
        externalShipmentId: dto.externalShipmentId,
        carrier: normalizedCarrier,
        trackingNumber: normalizedNumber,
        metadata: dto.metadata ?? {},
        currentStatus: NormalizedTrackingStatus.UNKNOWN,
        reconcileUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      record = await this.recordsRepo.save(record);
    } else if (dto.metadata) {
      record.metadata = { ...record.metadata, ...dto.metadata };
      await this.recordsRepo.save(record);
    }

    await this.jobs.enqueue(JobQueue.TRACKING_REGISTER, {
      tenantId,
      trackingRecordId: record.id,
      carrier: record.carrier,
      trackingNumber: record.trackingNumber,
      correlationId,
      isNew,
    });

    return record;
  }

  async processRegistrationJob(payload: {
    tenantId: string;
    trackingRecordId: string;
    carrier: string;
    trackingNumber: string;
    correlationId?: string;
    isNew?: boolean;
  }): Promise<void> {
    const record = await this.recordsRepo.findOne({
      where: { id: payload.trackingRecordId, tenantId: payload.tenantId },
    });
    if (!record) {
      return;
    }
    try {
      const registration = await this.provider.registerTracking({
        tenantId: payload.tenantId,
        trackingRecordId: record.id,
        carrier: record.carrier,
        trackingNumber: record.trackingNumber,
        metadata: record.metadata,
        correlationId: payload.correlationId,
      });
      record.providerTrackId = registration.providerTrackId ?? record.providerTrackId;
      record.registeredAt = record.registeredAt ?? new Date();
      await this.recordsRepo.save(record);

      const snapshot = await this.provider.getTrackingStatus(
        record.carrier,
        record.trackingNumber,
        payload.tenantId,
      );
      for (const checkpoint of snapshot.checkpoints) {
        await this.processor.applyCheckpoint(record, checkpoint, payload.correlationId);
      }
      if (payload.isNew) {
        await this.processor.emitRegisteredEvent(record, payload.correlationId);
      }
    } catch (err) {
      if (err instanceof ShippoHttpError && err.retryable) {
        throw err;
      }
      if (err instanceof ShippoHttpError) {
        return;
      }
      throw err;
    }
  }

  async refresh(
    tenantId: string,
    id: string,
    correlationId?: string,
  ): Promise<TrackingRecord> {
    const record = await this.getById(tenantId, id);
    const snapshot = await this.provider.getTrackingStatus(
      record.carrier,
      record.trackingNumber,
      tenantId,
    );
    for (const checkpoint of snapshot.checkpoints) {
      await this.processor.applyCheckpoint(record, checkpoint, correlationId);
    }
    return (await this.recordsRepo.findOne({ where: { id: record.id } }))!;
  }

  async getById(tenantId: string, id: string): Promise<TrackingRecord> {
    const record = await this.recordsRepo.findOne({ where: { id, tenantId } });
    if (!record) {
      throw new NotFoundException('Tracking record not found');
    }
    return record;
  }

  async list(tenantId: string, query: ListTrackingQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.recordsRepo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId });
    if (query.externalShipmentId) {
      qb.andWhere('t.external_shipment_id = :externalShipmentId', {
        externalShipmentId: query.externalShipmentId,
      });
    }
    if (query.status) {
      qb.andWhere('t.current_status = :status', { status: query.status });
    }
    if (query.carrier) {
      qb.andWhere('t.carrier = :carrier', { carrier: query.carrier.toLowerCase() });
    }
    qb.orderBy('t.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async history(tenantId: string, id: string, page = 1, limit = 50) {
    await this.getById(tenantId, id);
    const [items, total] = await this.historyRepo.findAndCount({
      where: { trackingRecordId: id, tenantId },
      order: { occurredAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }
}
