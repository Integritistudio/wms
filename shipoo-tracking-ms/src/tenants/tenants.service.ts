import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyService } from '../auth/api-key.service.js';
import { TenantStatus } from '../common/enums.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { TenantProviderCredential } from '../database/entities/tenant-provider-credential.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    @InjectRepository(TenantProviderCredential)
    private readonly credentialsRepo: Repository<TenantProviderCredential>,
    private readonly apiKeys: ApiKeyService,
    private readonly encryption: EncryptionService,
  ) {}

  async createTenant(dto: CreateTenantDto): Promise<{
    tenant: Tenant;
    apiKey: { plaintext: string; keyId: string; prefix: string };
  }> {
    const existing = await this.tenantsRepo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException('Tenant slug already exists');
    }
    const tenant = await this.tenantsRepo.save(
      this.tenantsRepo.create({
        name: dto.name,
        slug: dto.slug,
        status: TenantStatus.ACTIVE,
      }),
    );
    await this.credentialsRepo.save(
      this.credentialsRepo.create({ tenantId: tenant.id }),
    );
    const apiKey = await this.apiKeys.issueApiKey(tenant.id, dto.apiKeyLabel);
    return { tenant, apiKey };
  }

  async listTenants(): Promise<Tenant[]> {
    return this.tenantsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenantsRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async rotateTenantApiKey(
    tenantId: string,
    label?: string,
  ): Promise<{ plaintext: string; keyId: string; prefix: string }> {
    await this.getTenant(tenantId);
    return this.apiKeys.issueApiKey(tenantId, label);
  }

  async setShippoCredential(
    tenantId: string,
    shippoApiToken?: string,
  ): Promise<void> {
    await this.getTenant(tenantId);
    let row = await this.credentialsRepo.findOne({ where: { tenantId } });
    if (!row) {
      row = this.credentialsRepo.create({ tenantId });
    }
    row.shippoApiTokenCiphertext = shippoApiToken
      ? this.encryption.encrypt(shippoApiToken)
      : null;
    await this.credentialsRepo.save(row);
  }
}
