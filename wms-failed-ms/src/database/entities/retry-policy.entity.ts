import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';

@Entity('retry_policies')
export class RetryPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId!: string;

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts!: number;

  @Column({ name: 'base_delay_seconds', type: 'int', default: 30 })
  baseDelaySeconds!: number;

  @Column({ name: 'max_delay_seconds', type: 'int', default: 900 })
  maxDelaySeconds!: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 2 })
  multiplier!: number;

  @Column({ type: 'boolean', default: true })
  jitter!: boolean;

  @Column({
    name: 'retryable_reasons',
    type: 'text',
    array: true,
    default: () =>
      `ARRAY['SFTP_ERROR','SHOPIFY_ERROR','MODERNWMS_ERROR','MAPPING_EXCEPTION','ROUTING_NO_MATCH']`,
  })
  retryableReasons!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
