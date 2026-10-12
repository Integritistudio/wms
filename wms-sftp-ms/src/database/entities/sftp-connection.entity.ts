import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';

@Entity('sftp_connections')
export class SftpConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'external_id', type: 'varchar', length: 64, nullable: true })
  externalId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 255 })
  host!: string;

  @Column({ type: 'int', default: 22 })
  port!: number;

  @Column({ type: 'varchar', length: 255 })
  username!: string;

  @Column({ name: 'password_ciphertext', type: 'text', nullable: true })
  passwordCiphertext!: string | null;

  @Column({ name: 'private_key_ciphertext', type: 'text', nullable: true })
  privateKeyCiphertext!: string | null;

  @Column({ name: 'remote_path', type: 'varchar', length: 512, default: '/inbound/940' })
  remotePath!: string;

  @Column({ name: 'inbound_path', type: 'varchar', length: 512, default: '/outbound/945' })
  inboundPath!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
