import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyService } from '../auth/api-key.service.js';
import { TenantStatus } from '../common/enums.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    private readonly apiKeys: ApiKeyService,
  ) {}

  async createTenant(dto: CreateTenantDto) {
    if (await this.tenantsRepo.findOne({ where: { slug: dto.slug } })) {
      throw new ConflictException('Tenant slug already exists');
    }
    if (dto.externalCompanyId) {
      const byCo = await this.tenantsRepo.findOne({
        where: { externalCompanyId: dto.externalCompanyId },
      });
      if (byCo) throw new ConflictException('externalCompanyId already mapped');
    }
    const tenant = await this.tenantsRepo.save(
      this.tenantsRepo.create({
        name: dto.name,
        slug: dto.slug,
        externalCompanyId: dto.externalCompanyId ?? null,
        status: TenantStatus.ACTIVE,
      }),
    );
    const apiKey = await this.apiKeys.issueApiKey(tenant.id, dto.apiKeyLabel);
    return { tenant, apiKey };
  }

  async ensureByExternalCompanyId(input: {
    externalCompanyId: string;
    name?: string;
    slug?: string;
  }) {
    const existing = await this.tenantsRepo.findOne({
      where: { externalCompanyId: input.externalCompanyId },
    });
    if (existing) return { tenant: existing };
    const slug =
      input.slug ||
      `co-${input.externalCompanyId.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    return this.createTenant({
      name: input.name || `Company ${input.externalCompanyId}`,
      slug,
      externalCompanyId: input.externalCompanyId,
      apiKeyLabel: 'linker',
    });
  }

  list() {
    return this.tenantsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  rotateApiKey(tenantId: string, label?: string) {
    return this.apiKeys.issueApiKey(tenantId, label);
  }
}
