import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditAction, FailureStatus } from '../common/enums.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { AlertEvent } from '../database/entities/alert-event.entity.js';
import { AlertRule } from '../database/entities/alert-rule.entity.js';
import { FailedItem } from '../database/entities/failed-item.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { UpdateAlertDto } from './dto/update-alert.dto.js';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly rulesRepo: Repository<AlertRule>,
    @InjectRepository(AlertEvent)
    private readonly eventsRepo: Repository<AlertEvent>,
    @InjectRepository(FailedItem)
    private readonly itemsRepo: Repository<FailedItem>,
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
  ) {}

  async get(tenantId: string): Promise<AlertRule> {
    const rule = await this.rulesRepo.findOne({ where: { tenantId } });
    if (!rule) throw new NotFoundException('Alert rule not found');
    return rule;
  }

  async update(tenantId: string, dto: UpdateAlertDto): Promise<AlertRule> {
    const rule = await this.get(tenantId);
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.depthThreshold !== undefined) rule.depthThreshold = dto.depthThreshold;
    if (dto.ageThresholdMinutes !== undefined) {
      rule.ageThresholdMinutes = dto.ageThresholdMinutes;
    }
    if (dto.cooldownSeconds !== undefined) rule.cooldownSeconds = dto.cooldownSeconds;
    if (dto.webhookUrl !== undefined) rule.webhookUrl = dto.webhookUrl;
    if (dto.emailTo !== undefined) rule.emailTo = dto.emailTo;
    const saved = await this.rulesRepo.save(rule);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.ALERT_UPDATE,
        detail: { ...dto },
      }),
    );
    return saved;
  }

  async checkAllTenants(): Promise<void> {
    const rules = await this.rulesRepo.find({ where: { enabled: true } });
    for (const rule of rules) {
      await this.checkTenant(rule).catch((err) =>
        this.logger.error({ err, tenantId: rule.tenantId }, 'Alert check failed'),
      );
    }
  }

  private async checkTenant(rule: AlertRule): Promise<void> {
    if (!rule.webhookUrl && !rule.emailTo) return;

    const openCount = await this.itemsRepo.count({
      where: {
        tenantId: rule.tenantId,
        status: In([FailureStatus.OPEN, FailureStatus.RETRYING]),
      },
    });

    let ageTriggered = false;
    if (rule.ageThresholdMinutes > 0) {
      const cutoff = new Date(Date.now() - rule.ageThresholdMinutes * 60_000);
      const old = await this.itemsRepo
        .createQueryBuilder('f')
        .where('f.tenant_id = :tenantId', { tenantId: rule.tenantId })
        .andWhere('f.status IN (:...statuses)', {
          statuses: [FailureStatus.OPEN, FailureStatus.RETRYING],
        })
        .andWhere('f.created_at <= :cutoff', { cutoff })
        .getCount();
      ageTriggered = old > 0;
    }

    if (openCount < rule.depthThreshold && !ageTriggered) return;

    const last = await this.eventsRepo.findOne({
      where: { tenantId: rule.tenantId },
      order: { createdAt: 'DESC' },
    });
    if (
      last &&
      Date.now() - last.createdAt.getTime() < rule.cooldownSeconds * 1000 &&
      openCount <= last.openCount
    ) {
      return;
    }

    const tenant = await this.tenantsRepo.findOne({ where: { id: rule.tenantId } });
    const text = [
      `WMS Failed Orders alert`,
      `Tenant: ${tenant?.name || rule.tenantId}`,
      `Open failures: ${openCount}`,
      `Depth threshold: ${rule.depthThreshold}`,
      ageTriggered ? `Age threshold exceeded (${rule.ageThresholdMinutes}m)` : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (rule.webhookUrl) {
      try {
        await fetch(rule.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, openCount, tenantId: rule.tenantId }),
        });
        await this.eventsRepo.save(
          this.eventsRepo.create({
            tenantId: rule.tenantId,
            openCount,
            channel: 'webhook',
            payload: { text },
          }),
        );
      } catch (err) {
        this.logger.warn({ err }, 'Webhook alert failed');
      }
    }

    if (rule.emailTo) {
      // Email delivery is delegated to Linker SMTP in a later iteration;
      // record the intent so ops can wire a webhook/SMTP bridge.
      await this.eventsRepo.save(
        this.eventsRepo.create({
          tenantId: rule.tenantId,
          openCount,
          channel: 'email',
          payload: { to: rule.emailTo, text },
        }),
      );
    }
  }
}
