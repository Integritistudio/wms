import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from '../../common/enums.js';

@Entity('action_audit')
@Index(['tenantId', 'createdAt'])
export class ActionAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'notification_id', type: 'uuid', nullable: true })
  notificationId!: string | null;

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
