import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';

@Entity('suppressions')
@Unique(['tenantId', 'email'])
export class Suppression {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 64, default: 'manual' })
  reason!: string;

  @Column({ type: 'text', default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
