import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  NormalizedTrackingStatus,
  TrackingProviderName,
} from '../../common/enums.js';

@Entity('tracking_records')
@Unique(['tenantId', 'externalShipmentId'])
@Unique(['tenantId', 'carrier', 'trackingNumber'])
@Index(['tenantId', 'currentStatus'])
@Index(['carrier', 'trackingNumber'])
export class TrackingRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'external_shipment_id', type: 'varchar', length: 255 })
  externalShipmentId!: string;

  @Column({ type: 'varchar', length: 64 })
  carrier!: string;

  @Column({ name: 'tracking_number', type: 'varchar', length: 128 })
  trackingNumber!: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: TrackingProviderName.SHIPPO,
  })
  provider!: TrackingProviderName;

  @Column({ name: 'provider_track_id', type: 'varchar', length: 128, nullable: true })
  providerTrackId!: string | null;

  @Column({
    name: 'current_status',
    type: 'varchar',
    length: 32,
    default: NormalizedTrackingStatus.UNKNOWN,
  })
  currentStatus!: NormalizedTrackingStatus;

  @Column({ name: 'last_provider_status', type: 'varchar', length: 64, nullable: true })
  lastProviderStatus!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ name: 'registered_at', type: 'timestamptz', nullable: true })
  registeredAt!: Date | null;

  @Column({ name: 'last_event_at', type: 'timestamptz', nullable: true })
  lastEventAt!: Date | null;

  @Column({ name: 'reconcile_until', type: 'timestamptz', nullable: true })
  reconcileUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
