import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyService } from '../auth/api-key.service.js';
import { DEFAULT_RETRYABLE_REASONS, TenantStatus } from '../common/enums.js';
import { AlertRule } from '../database/entities/alert-rule.entity.js';
import { RetryPolicy } from '../database/entities/retry-policy.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    @InjectRepository(RetryPolicy)
    private readonly policiesRepo: Repository<RetryPolicy>,
    @InjectRepository(AlertRule)
    private readonly alertsRepo: Repository<AlertRule>,
    private readonly apiKeys: ApiKeyService,
    private readonly config: ConfigService,
  ) {}

  async createTenant(dto: CreateTenantDto): Promise<{
    tenant: Tenant;
    apiKey: { plaintext: string; keyId: string; prefix: string };
  }> {
    const bySlug = await this.tenantsRepo.findOne({ where: { slug: dto.slug } });
    if (bySlug) throw new ConflictException('Tenant slug already exists');
    const byCompany = await this.tenantsRepo.findOne({
      where: { externalCompanyId: dto.externalCompanyId },
    });
    if (byCompany) throw new ConflictException('externalCompanyId already mapped');

    const tenant = await this.tenantsRepo.save(
      this.tenantsRepo.create({
        name: dto.name,
        slug: dto.slug,
        externalCompanyId: dto.externalCompanyId,
        status: TenantStatus.ACTIVE,
      }),
    );

    await this.policiesRepo.save(
      this.policiesRepo.create({
        tenantId: tenant.id,
        enabled: true,
        maxAttempts: this.config.get<number>('defaults.maxAttempts') ?? 5,
        baseDelaySeconds: this.config.get<number>('defaults.baseDelaySeconds') ?? 30,
        maxDelaySeconds: this.config.get<number>('defaults.maxDelaySeconds') ?? 900,
        multiplier: this.config.get<number>('defaults.multiplier') ?? 2,
        jitter: true,
        retryableReasons: [...DEFAULT_RETRYABLE_REASONS],
      }),
    );

    await this.alertsRepo.save(
      this.alertsRepo.create({
        tenantId: tenant.id,
        enabled: true,
        depthThreshold: 5,
        cooldownSeconds: 300,
      }),
    );

    const apiKey = await this.apiKeys.issueApiKey(tenant.id, dto.apiKeyLabel);
    return { tenant, apiKey };
  }

  async ensureByExternalCompanyId(input: {
    externalCompanyId: string;
    name?: string;
    slug?: string;
  }): Promise<{ tenant: Tenant; apiKeyPlaintext?: string }> {
    const existing = await this.tenantsRepo.findOne({
      where: { externalCompanyId: input.externalCompanyId },
    });
    if (existing) return { tenant: existing };

    const slug =
      input.slug ||
      `co-${input.externalCompanyId.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    const created = await this.createTenant({
      name: input.name || `Company ${input.externalCompanyId}`,
      slug,
      externalCompanyId: input.externalCompanyId,
      apiKeyLabel: 'linker',
    });
    return { tenant: created.tenant, apiKeyPlaintext: created.apiKey.plaintext };
  }

  async listTenants(): Promise<Tenant[]> {
    return this.tenantsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenantsRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findByExternalCompanyId(externalCompanyId: string): Promise<Tenant | null> {
    return this.tenantsRepo.findOne({ where: { externalCompanyId } });
  }

  async rotateTenantApiKey(
    tenantId: string,
    label?: string,
  ): Promise<{ plaintext: string; keyId: string; prefix: string }> {
    await this.getTenant(tenantId);
    return this.apiKeys.issueApiKey(tenantId, label);
  }
}
