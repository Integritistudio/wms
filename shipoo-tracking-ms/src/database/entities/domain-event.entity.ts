import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { DomainEventType } from '../../common/enums.js';

@Entity('domain_events')
@Index(['tenantId', 'createdAt'])
export class DomainEvent {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'tracking_record_id', type: 'uuid' })
  trackingRecordId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: DomainEventType;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64, nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
