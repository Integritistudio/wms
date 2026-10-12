import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums.js';
import { sanitizeEmailHtml } from '../common/security/html.util.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { EmailTemplate } from '../database/entities/email-template.entity.js';
import { UpsertTemplateDto } from './dto/upsert-template.dto.js';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly templatesRepo: Repository<EmailTemplate>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
  ) {}

  async list(tenantId: string) {
    return this.templatesRepo.find({
      where: { tenantId },
      order: { key: 'ASC' },
    });
  }

  async upsert(tenantId: string, dto: UpsertTemplateDto) {
    let row = await this.templatesRepo.findOne({
      where: { tenantId, key: dto.key },
    });
    if (!row) {
      row = this.templatesRepo.create({ tenantId, key: dto.key });
    }
    row.name = dto.name;
    row.subjectTemplate = dto.subjectTemplate;
    row.textTemplate = dto.textTemplate ?? '';
    row.htmlTemplate = dto.htmlTemplate
      ? sanitizeEmailHtml(dto.htmlTemplate)
      : '';
    if (dto.active !== undefined) row.active = dto.active;
    const saved = await this.templatesRepo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.TEMPLATE_UPSERT,
        detail: { key: dto.key },
      }),
    );
    return saved;
  }

  async get(tenantId: string, key: string) {
    const row = await this.templatesRepo.findOne({ where: { tenantId, key } });
    if (!row) throw new NotFoundException('Template not found');
    return row;
  }
}
