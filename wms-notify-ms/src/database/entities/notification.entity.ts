import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationType, PushStatus } from '../../common/enums.js';

@Entity('notifications')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'read', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'external_user_id', type: 'varchar', length: 64, nullable: true })
  externalUserId!: string | null;

  @Column({ type: 'varchar', length: 64, default: NotificationType.SYSTEM })
  type!: string;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  @Column({ type: 'text', default: '' })
  message!: string;

  @Column({ type: 'jsonb', default: {} })
  meta!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: ['in_app'] })
  channels!: string[];

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'push_status', type: 'varchar', length: 32, default: PushStatus.NONE })
  pushStatus!: PushStatus;

  @Column({ name: 'push_attempts', type: 'int', default: 0 })
  pushAttempts!: number;

  @Column({ name: 'push_last_error', type: 'text', nullable: true })
  pushLastError!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
