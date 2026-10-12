import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums.js';
import { normalizeEmail } from '../common/security/email.util.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Suppression } from '../database/entities/suppression.entity.js';
import { AddSuppressionDto } from './dto/suppression.dto.js';

@Injectable()
export class SuppressionsService {
  constructor(
    @InjectRepository(Suppression)
    private readonly repo: Repository<Suppression>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
  ) {}

  list(tenantId: string) {
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async add(tenantId: string, dto: AddSuppressionDto) {
    const email = normalizeEmail(dto.email);
    let row = await this.repo.findOne({ where: { tenantId, email } });
    if (!row) {
      row = this.repo.create({ tenantId, email });
    }
    row.reason = dto.reason || 'manual';
    row.note = dto.note || '';
    const saved = await this.repo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.SUPPRESSION_ADD,
        detail: { email },
      }),
    );
    return saved;
  }

  async remove(tenantId: string, emailRaw: string) {
    const email = normalizeEmail(emailRaw);
    await this.repo.delete({ tenantId, email });
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.SUPPRESSION_REMOVE,
        detail: { email },
      }),
    );
    return { removed: true, email };
  }
}
