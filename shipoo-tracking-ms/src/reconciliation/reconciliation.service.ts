import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobQueue, TERMINAL_TRACKING_STATUSES } from '../common/enums.js';
import { TrackingRecord } from '../database/entities/tracking-record.entity.js';
import { JobsService } from '../jobs/jobs.service.js';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(TrackingRecord)
    private readonly recordsRepo: Repository<TrackingRecord>,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  async enqueueStaleRecords(): Promise<number> {
    const staleMinutes = this.config.get<number>('reconciliation.staleMinutes') ?? 60;
    const batchSize = this.config.get<number>('reconciliation.batchSize') ?? 50;
    const cutoff = new Date(Date.now() - staleMinutes * 60_000);
    const records = await this.recordsRepo
      .createQueryBuilder('t')
      .where('t.reconcile_until IS NOT NULL')
      .andWhere('t.last_event_at IS NULL OR t.last_event_at < :cutoff', { cutoff })
      .andWhere('t.current_status NOT IN (:...terminal)', {
        terminal: TERMINAL_TRACKING_STATUSES,
      })
      .orderBy('t.last_event_at', 'ASC', 'NULLS FIRST')
      .take(batchSize)
      .getMany();

    for (const record of records) {
      await this.jobs.enqueue(
        JobQueue.TRACKING_RECONCILE,
        {
          tenantId: record.tenantId,
          trackingRecordId: record.id,
        },
        { singletonKey: `reconcile:${record.id}` },
      );
    }
    this.logger.log(
      JSON.stringify({ msg: 'reconciliation_enqueued', count: records.length }),
    );
    return records.length;
  }
}
