import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  FailureReason,
  FailureResolution,
  FailureStatus,
} from '../../common/enums.js';
import { Tenant } from './tenant.entity.js';

@Entity('failed_items')
@Index(['tenantId', 'status'])
export class FailedItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'external_order_id', type: 'varchar', length: 64 })
  externalOrderId!: string;

  @Column({ name: 'external_shop_id', type: 'varchar', length: 64 })
  externalShopId!: string;

  @Column({ name: 'external_company_id', type: 'varchar', length: 64 })
  externalCompanyId!: string;

  @Column({ name: 'external_warehouse_id', type: 'varchar', length: 64, nullable: true })
  externalWarehouseId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  reason!: FailureReason;

  @Column({ name: 'error_message', type: 'text', default: '' })
  errorMessage!: string;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: 'int', default: 1 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts!: number;

  @Column({ type: 'varchar', length: 32, default: FailureStatus.OPEN })
  status!: FailureStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  resolution!: FailureResolution | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_by', type: 'varchar', length: 255, default: '' })
  resolvedBy!: string;

  @Column({ name: 'auto_retry_enabled', type: 'boolean', default: true })
  autoRetryEnabled!: boolean;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: 'last_retry_at', type: 'timestamptz', nullable: true })
  lastRetryAt!: Date | null;

  @Column({ type: 'text', default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
