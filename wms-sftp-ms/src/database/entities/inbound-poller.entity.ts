import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SftpConnection } from './sftp-connection.entity.js';
import { Tenant } from './tenant.entity.js';

@Entity('inbound_pollers')
export class InboundPoller {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'connection_id', type: 'uuid', unique: true })
  connectionId!: string;

  @OneToOne(() => SftpConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection!: SftpConnection;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'remote_path', type: 'varchar', length: 512, default: '/outbound/945' })
  remotePath!: string;

  @Column({ name: 'file_glob', type: 'varchar', length: 128, default: '*.edi' })
  fileGlob!: string;

  @Column({ name: 'delete_after_fetch', type: 'boolean', default: false })
  deleteAfterFetch!: boolean;

  @Column({ name: 'last_polled_at', type: 'timestamptz', nullable: true })
  lastPolledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
