import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeliveryStatus } from '../../common/enums.js';

@Entity('push_deliveries')
@Index(['status', 'scheduledAt'])
export class PushDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId!: string;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId!: string | null;

  @Column({ type: 'varchar', length: 32, default: DeliveryStatus.QUEUED })
  status!: DeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'provider_response', type: 'jsonb', default: {} })
  providerResponse!: Record<string, unknown>;

  @Column({ name: 'scheduled_at', type: 'timestamptz', default: () => 'NOW()' })
  scheduledAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
