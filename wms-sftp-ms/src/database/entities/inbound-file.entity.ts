import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { EdiDocumentType } from '../../common/enums.js';
import { SftpConnection } from './sftp-connection.entity.js';
import { Tenant } from './tenant.entity.js';

@Entity('inbound_files')
@Unique(['tenantId', 'bodyHash'])
export class InboundFile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'connection_id', type: 'uuid' })
  connectionId!: string;

  @ManyToOne(() => SftpConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection!: SftpConnection;

  @Column({ name: 'remote_path', type: 'varchar', length: 1024 })
  remotePath!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'body_hash', type: 'varchar', length: 64 })
  bodyHash!: string;

  @Column({ name: 'body_text', type: 'text' })
  bodyText!: string;

  @Column({ name: 'document_type', type: 'varchar', length: 16, default: EdiDocumentType.EDI_945 })
  documentType!: EdiDocumentType;

  @Column({ type: 'boolean', default: false })
  delivered!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
