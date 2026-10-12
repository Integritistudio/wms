import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('preferences')
export class Preference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'external_user_id', type: 'varchar', length: 64, nullable: true })
  externalUserId!: string | null;

  @Column({ name: 'notification_type', type: 'varchar', length: 64 })
  notificationType!: string;

  @Column({ name: 'in_app', type: 'boolean', default: true })
  inApp!: boolean;

  @Column({ type: 'boolean', default: true })
  push!: boolean;

  @Column({ type: 'boolean', default: false })
  email!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
