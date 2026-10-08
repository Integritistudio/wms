import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { RetryPolicy } from '../database/entities/retry-policy.entity.js';
import { UpdatePolicyDto } from './dto/update-policy.dto.js';

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(RetryPolicy)
    private readonly policiesRepo: Repository<RetryPolicy>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
  ) {}

  async get(tenantId: string): Promise<RetryPolicy> {
    const policy = await this.policiesRepo.findOne({ where: { tenantId } });
    if (!policy) throw new NotFoundException('Retry policy not found');
    return policy;
  }

  async update(tenantId: string, dto: UpdatePolicyDto): Promise<RetryPolicy> {
    const policy = await this.get(tenantId);
    if (dto.enabled !== undefined) policy.enabled = dto.enabled;
    if (dto.maxAttempts !== undefined) policy.maxAttempts = dto.maxAttempts;
    if (dto.baseDelaySeconds !== undefined) {
      policy.baseDelaySeconds = dto.baseDelaySeconds;
    }
    if (dto.maxDelaySeconds !== undefined) {
      policy.maxDelaySeconds = dto.maxDelaySeconds;
    }
    if (dto.multiplier !== undefined) policy.multiplier = dto.multiplier;
    if (dto.jitter !== undefined) policy.jitter = dto.jitter;
    if (dto.retryableReasons !== undefined) {
      policy.retryableReasons = dto.retryableReasons;
    }
    const saved = await this.policiesRepo.save(policy);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.POLICY_UPDATE,
        detail: { ...dto },
      }),
    );
    return saved;
  }
}
