import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from '../../common/enums.js';
import { FailedItem } from './failed-item.entity.js';
import { Tenant } from './tenant.entity.js';

@Entity('action_audit')
@Index(['tenantId', 'createdAt'])
export class ActionAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'failed_item_id', type: 'uuid', nullable: true })
  failedItemId!: string | null;

  @ManyToOne(() => FailedItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'failed_item_id' })
  failedItem!: FailedItem | null;

  @Column({ type: 'varchar', length: 64 })
  action!: AuditAction;

  @Column({ type: 'varchar', length: 255, default: 'system' })
  actor!: string;

  @Column({ type: 'boolean', default: true })
  success!: boolean;

  @Column({ type: 'jsonb', default: {} })
  detail!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
