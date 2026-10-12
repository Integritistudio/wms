import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuditAction, normalizeNotificationType } from '../common/enums.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Preference } from '../database/entities/preference.entity.js';
import { UpsertPreferenceDto } from './dto/upsert-preference.dto.js';

@Injectable()
export class PreferencesService {
  constructor(
    @InjectRepository(Preference)
    private readonly prefsRepo: Repository<Preference>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
  ) {}

  toPublic(row: Preference) {
    return {
      id: row.id,
      type: row.notificationType,
      userId: row.externalUserId,
      inApp: row.inApp,
      push: row.push,
      email: row.email,
      updatedAt: row.updatedAt,
    };
  }

  async list(tenantId: string, userId?: string) {
    const where = userId
      ? { tenantId, externalUserId: userId }
      : { tenantId, externalUserId: IsNull() };
    const rows = await this.prefsRepo.find({ where, order: { notificationType: 'ASC' } });
    return rows.map((r) => this.toPublic(r));
  }

  async upsert(tenantId: string, dto: UpsertPreferenceDto, actor = 'tenant') {
    const type = normalizeNotificationType(dto.type);
    const userId = dto.userId || null;
    let row = userId
      ? await this.prefsRepo.findOne({
          where: { tenantId, externalUserId: userId, notificationType: type },
        })
      : await this.prefsRepo.findOne({
          where: {
            tenantId,
            externalUserId: IsNull(),
            notificationType: type,
          },
        });
    if (!row) {
      row = this.prefsRepo.create({
        tenantId,
        externalUserId: userId,
        notificationType: type,
      });
    }
    if (dto.inApp !== undefined) row.inApp = dto.inApp;
    if (dto.push !== undefined) row.push = dto.push;
    if (dto.email !== undefined) row.email = dto.email;
    const saved = await this.prefsRepo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.PREFS_UPSERT,
        actor,
        detail: { type, userId },
      }),
    );
    return this.toPublic(saved);
  }
}
