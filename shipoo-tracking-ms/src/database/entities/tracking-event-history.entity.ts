import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NormalizedTrackingStatus } from '../../common/enums.js';

@Entity('tracking_event_history')
@Index(['trackingRecordId', 'occurredAt'])
export class TrackingEventHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tracking_record_id', type: 'uuid' })
  trackingRecordId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'normalized_status', type: 'varchar', length: 32 })
  normalizedStatus!: NormalizedTrackingStatus;

  @Column({ name: 'provider_status', type: 'varchar', length: 64, nullable: true })
  providerStatus!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'jsonb', default: {} })
  raw!: Record<string, unknown>;

  @Column({ name: 'sequence_key', type: 'varchar', length: 128 })
  sequenceKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
