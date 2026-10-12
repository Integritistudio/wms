import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DevicePlatform } from '../../common/enums.js';

@Entity('devices')
@Index(['tenantId', 'enabled'])
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'external_user_id', type: 'varchar', length: 64, nullable: true })
  externalUserId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  platform!: DevicePlatform;

  @Column({ type: 'text' })
  token!: string;

  @Column({ type: 'text', nullable: true })
  endpoint!: string | null;

  @Column({ type: 'text', nullable: true })
  p256dh!: string | null;

  @Column({ type: 'text', nullable: true })
  auth!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
