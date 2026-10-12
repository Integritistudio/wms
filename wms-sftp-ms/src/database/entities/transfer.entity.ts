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
  EdiDocumentType,
  TransferDirection,
  TransferStatus,
} from '../../common/enums.js';
import { SftpConnection } from './sftp-connection.entity.js';
import { Tenant } from './tenant.entity.js';

@Entity('transfers')
@Index(['status', 'scheduledAt'])
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'connection_id', type: 'uuid' })
  connectionId!: string;

  @ManyToOne(() => SftpConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection!: SftpConnection;

  @Column({ type: 'varchar', length: 16, default: TransferDirection.UPLOAD })
  direction!: TransferDirection;

  @Column({ name: 'document_type', type: 'varchar', length: 16, default: EdiDocumentType.EDI_940 })
  documentType!: EdiDocumentType;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'remote_path', type: 'varchar', length: 1024 })
  remotePath!: string;

  @Column({ name: 'body_text', type: 'text', nullable: true })
  bodyText!: string | null;

  @Column({ name: 'body_hash', type: 'varchar', length: 64, nullable: true })
  bodyHash!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'external_order_id', type: 'varchar', length: 64, nullable: true })
  externalOrderId!: string | null;

  @Column({ name: 'external_group_id', type: 'varchar', length: 64, nullable: true })
  externalGroupId!: string | null;

  @Column({ type: 'varchar', length: 32, default: TransferStatus.QUEUED })
  status!: TransferStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts!: number;

  @Column({ name: 'last_error', type: 'text', default: '' })
  lastError!: string;

  @Column({ type: 'int', default: 0 })
  bytes!: number;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs!: number;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
