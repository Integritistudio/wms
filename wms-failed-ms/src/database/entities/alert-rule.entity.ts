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

@Entity('alert_rules')
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId!: string;

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'depth_threshold', type: 'int', default: 5 })
  depthThreshold!: number;

  @Column({ name: 'age_threshold_minutes', type: 'int', default: 0 })
  ageThresholdMinutes!: number;

  @Column({ name: 'cooldown_seconds', type: 'int', default: 300 })
  cooldownSeconds!: number;

  @Column({ name: 'webhook_url', type: 'text', nullable: true })
  webhookUrl!: string | null;

  @Column({ name: 'email_to', type: 'text', nullable: true })
  emailTo!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
