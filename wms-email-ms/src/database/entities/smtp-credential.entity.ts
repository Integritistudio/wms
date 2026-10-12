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

@Entity('smtp_credentials')
export class SmtpCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId!: string;

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 255 })
  host!: string;

  @Column({ type: 'int', default: 587 })
  port!: number;

  @Column({ type: 'boolean', default: false })
  secure!: boolean;

  @Column({ name: 'username_ciphertext', type: 'text', nullable: true })
  usernameCiphertext!: string | null;

  @Column({ name: 'password_ciphertext', type: 'text', nullable: true })
  passwordCiphertext!: string | null;

  @Column({ name: 'from_address', type: 'varchar', length: 320 })
  fromAddress!: string;

  @Column({ name: 'from_name', type: 'varchar', length: 255, default: '' })
  fromName!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
