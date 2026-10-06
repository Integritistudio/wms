import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../common/crypto/encryption.service.js';
import { TenantProviderCredential } from '../../database/entities/tenant-provider-credential.entity.js';

@Injectable()
export class ShippoCredentialResolver {
  constructor(
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
    @InjectRepository(TenantProviderCredential)
    private readonly credentialsRepo: Repository<TenantProviderCredential>,
  ) {}

  async resolveApiToken(tenantId: string): Promise<string> {
    const row = await this.credentialsRepo.findOne({ where: { tenantId } });
    if (row?.shippoApiTokenCiphertext) {
      return this.encryption.decrypt(row.shippoApiTokenCiphertext);
    }
    const platform = this.config.get<string>('shippo.platformApiToken') ?? '';
    if (!platform) {
      throw new Error('Shippo API token is not configured');
    }
    return platform;
  }
}
