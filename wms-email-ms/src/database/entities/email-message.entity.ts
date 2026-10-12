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
import { MailPriority, MailStatus } from '../../common/enums.js';
import { Tenant } from './tenant.entity.js';

@Entity('email_messages')
@Index(['tenantId', 'status'])
export class EmailMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'template_key', type: 'varchar', length: 100, nullable: true })
  templateKey!: string | null;

  @Column({ name: 'to_addresses', type: 'text', array: true })
  toAddresses!: string[];

  @Column({ name: 'cc_addresses', type: 'text', array: true, default: '{}' })
  ccAddresses!: string[];

  @Column({ name: 'bcc_addresses', type: 'text', array: true, default: '{}' })
  bccAddresses!: string[];

  @Column({ name: 'reply_to', type: 'varchar', length: 320, nullable: true })
  replyTo!: string | null;

  @Column({ type: 'varchar', length: 998 })
  subject!: string;

  @Column({ name: 'text_body', type: 'text', default: '' })
  textBody!: string;

  @Column({ name: 'html_body', type: 'text', default: '' })
  htmlBody!: string;

  @Column({ type: 'jsonb', default: {} })
  headers!: Record<string, string>;

  @Column({ type: 'jsonb', default: {} })
  variables!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: MailPriority.NORMAL })
  priority!: MailPriority;

  @Column({ type: 'varchar', length: 32, default: MailStatus.QUEUED })
  status!: MailStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 8 })
  maxAttempts!: number;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'last_error', type: 'text', default: '' })
  lastError!: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
