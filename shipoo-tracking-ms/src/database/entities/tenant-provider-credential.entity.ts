import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';

@Entity('tenant_provider_credentials')
export class TenantProviderCredential {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({
    name: 'shippo_api_token_ciphertext',
    type: 'text',
    nullable: true,
  })
  shippoApiTokenCiphertext!: string | null;

  @Column({ name: 'shippo_webhook_id', type: 'varchar', length: 64, nullable: true })
  shippoWebhookId!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
