import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_entries')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'type', 'createdAt'])
export class AuditEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  type!: string;

  @Column({ type: 'varchar', length: 255, default: 'system' })
  actor!: string;

  @Column({ name: 'order_id', type: 'varchar', length: 64, nullable: true })
  orderId!: string | null;

  @Column({ name: 'warehouse_id', type: 'varchar', length: 64, nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'external_user_id', type: 'varchar', length: 64, nullable: true })
  externalUserId!: string | null;

  @Column({ name: 'from_state', type: 'varchar', length: 128, default: '' })
  fromState!: string;

  @Column({ name: 'to_state', type: 'varchar', length: 128, default: '' })
  toState!: string;

  @Column({ type: 'text', default: '' })
  message!: string;

  @Column({ type: 'jsonb', default: {} })
  meta!: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64, nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
