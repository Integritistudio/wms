import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { TenantStatus } from '../common/enums.js';
import { TenantApiKey } from '../database/entities/tenant-api-key.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';

const KEY_PREFIX = 'wms_fail_';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(TenantApiKey)
    private readonly keysRepo: Repository<TenantApiKey>,
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
  ) {}

  async validateBearerToken(token: string): Promise<{ tenantId: string; apiKeyId: string }> {
    if (!token.startsWith(KEY_PREFIX) || token.length < 20) {
      throw new UnauthorizedException('Invalid API credentials');
    }
    const keyPrefix = token.slice(0, 16);
    const candidates = await this.keysRepo.find({
      where: { keyPrefix, revokedAt: IsNull() },
      relations: { tenant: true },
    });
    for (const candidate of candidates) {
      const valid = await argon2.verify(candidate.secretHash, token);
      if (valid && candidate.tenant.status === TenantStatus.ACTIVE) {
        await this.keysRepo.update(candidate.id, { lastUsedAt: new Date() });
        return { tenantId: candidate.tenantId, apiKeyId: candidate.id };
      }
    }
    throw new UnauthorizedException('Invalid API credentials');
  }

  async issueApiKey(
    tenantId: string,
    label?: string,
  ): Promise<{ plaintext: string; keyId: string; prefix: string }> {
    const secret = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
    const keyPrefix = secret.slice(0, 16);
    const secretHash = await argon2.hash(secret);
    const saved = await this.keysRepo.save(
      this.keysRepo.create({
        tenantId,
        keyPrefix,
        secretHash,
        label: label ?? null,
      }),
    );
    return { plaintext: secret, keyId: saved.id, prefix: keyPrefix };
  }
}
