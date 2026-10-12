import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyService } from '../auth/api-key.service.js';
import { AuditAction, TenantStatus } from '../common/enums.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { SmtpCredential } from '../database/entities/smtp-credential.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpsertSmtpDto } from './dto/upsert-smtp.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    @InjectRepository(SmtpCredential)
    private readonly smtpRepo: Repository<SmtpCredential>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
    private readonly apiKeys: ApiKeyService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  async createTenant(dto: CreateTenantDto) {
    const bySlug = await this.tenantsRepo.findOne({ where: { slug: dto.slug } });
    if (bySlug) throw new ConflictException('Tenant slug already exists');
    if (dto.externalCompanyId) {
      const byCompany = await this.tenantsRepo.findOne({
        where: { externalCompanyId: dto.externalCompanyId },
      });
      if (byCompany) throw new ConflictException('externalCompanyId already mapped');
    }

    const tenant = await this.tenantsRepo.save(
      this.tenantsRepo.create({
        name: dto.name,
        slug: dto.slug,
        externalCompanyId: dto.externalCompanyId ?? null,
        status: TenantStatus.ACTIVE,
        dailyQuota:
          dto.dailyQuota ??
          this.config.get<number>('mail.defaultDailyQuota') ??
          2000,
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

  async listTenants() {
    return this.tenantsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getTenant(id: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async rotateApiKey(tenantId: string, label?: string) {
    await this.getTenant(tenantId);
    return this.apiKeys.issueApiKey(tenantId, label);
  }

  async upsertSmtp(tenantId: string, dto: UpsertSmtpDto) {
    await this.getTenant(tenantId);
    let row = await this.smtpRepo.findOne({ where: { tenantId } });
    if (!row) row = this.smtpRepo.create({ tenantId });
    row.host = dto.host;
    row.port = dto.port ?? 587;
    row.secure = Boolean(dto.secure);
    row.fromAddress = dto.fromAddress;
    row.fromName = dto.fromName ?? '';
    if (dto.username !== undefined) {
      row.usernameCiphertext = dto.username
        ? this.encryption.encrypt(dto.username)
        : null;
    }
    if (dto.password !== undefined) {
      row.passwordCiphertext = dto.password
        ? this.encryption.encrypt(dto.password)
        : null;
    }
    const saved = await this.smtpRepo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.SMTP_UPSERT,
        detail: { host: dto.host, fromAddress: dto.fromAddress },
      }),
    );
    return {
      id: saved.id,
      host: saved.host,
      port: saved.port,
      secure: saved.secure,
      fromAddress: saved.fromAddress,
      fromName: saved.fromName,
      usernameSet: Boolean(saved.usernameCiphertext),
      passwordSet: Boolean(saved.passwordCiphertext),
    };
  }

  async getSmtpPublic(tenantId: string) {
    const row = await this.smtpRepo.findOne({ where: { tenantId } });
    if (!row) return null;
    return {
      id: row.id,
      host: row.host,
      port: row.port,
      secure: row.secure,
      fromAddress: row.fromAddress,
      fromName: row.fromName,
      usernameSet: Boolean(row.usernameCiphertext),
      passwordSet: Boolean(row.passwordCiphertext),
    };
  }

  async setAllowPlatformSmtpFallback(tenantId: string, allow: boolean) {
    const tenant = await this.getTenant(tenantId);
    tenant.allowPlatformSmtpFallback = Boolean(allow);
    return this.tenantsRepo.save(tenant);
  }

  async resolveSmtpConfig(tenantId: string): Promise<{
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from: string;
    source: 'tenant' | 'platform';
  } | null> {
    const row = await this.smtpRepo.findOne({ where: { tenantId } });
    if (row) {
      return {
        host: row.host,
        port: row.port,
        secure: row.secure,
        user: row.usernameCiphertext
          ? this.encryption.decrypt(row.usernameCiphertext)
          : undefined,
        pass: row.passwordCiphertext
          ? this.encryption.decrypt(row.passwordCiphertext)
          : undefined,
        from: row.fromName
          ? `${row.fromName} <${row.fromAddress}>`
          : row.fromAddress,
        source: 'tenant',
      };
    }

    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (tenant && tenant.allowPlatformSmtpFallback === false) {
      return null;
    }

    const host = this.config.get<string>('smtp.host') || '';
    const from = this.config.get<string>('smtp.from') || '';
    if (!host || !from) return null;
    return {
      host,
      port: this.config.get<number>('smtp.port') ?? 587,
      secure: Boolean(this.config.get<boolean>('smtp.secure')),
      user: this.config.get<string>('smtp.user') || undefined,
      pass: this.config.get<string>('smtp.pass') || undefined,
      from,
      source: 'platform',
    };
  }
}
