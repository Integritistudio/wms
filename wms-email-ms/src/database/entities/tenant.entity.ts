import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantStatus } from '../../common/enums.js';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ name: 'external_company_id', type: 'varchar', length: 64, unique: true, nullable: true })
  externalCompanyId!: string | null;

  @Column({ type: 'varchar', length: 32, default: TenantStatus.ACTIVE })
  status!: TenantStatus;

  @Column({ name: 'daily_quota', type: 'int', default: 2000 })
  dailyQuota!: number;

  /** When true and tenant has no SMTP row, fall back to env SMTP_* */
  @Column({ name: 'allow_platform_smtp_fallback', type: 'boolean', default: true })
  allowPlatformSmtpFallback!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
