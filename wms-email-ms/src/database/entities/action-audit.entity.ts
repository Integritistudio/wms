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
import { EmailMessage } from './email-message.entity.js';
import { Tenant } from './tenant.entity.js';

@Entity('action_audit')
@Index(['tenantId', 'createdAt'])
export class ActionAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant | null;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId!: string | null;

  @ManyToOne(() => EmailMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'message_id' })
  message!: EmailMessage | null;

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
