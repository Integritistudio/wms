import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';

@Entity('email_templates')
@Unique(['tenantId', 'key'])
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 100 })
  key!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'subject_template', type: 'text' })
  subjectTemplate!: string;

  @Column({ name: 'text_template', type: 'text', default: '' })
  textTemplate!: string;

  @Column({ name: 'html_template', type: 'text', default: '' })
  htmlTemplate!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
