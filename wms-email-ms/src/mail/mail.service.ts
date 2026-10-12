import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import {
  AuditAction,
  JobQueue,
  MailPriority,
  MailStatus,
} from '../common/enums.js';
import { assertEmails, normalizeEmail, renderTemplate } from '../common/security/email.util.js';
import { sanitizeEmailHtml } from '../common/security/html.util.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { EmailMessage } from '../database/entities/email-message.entity.js';
import { EmailTemplate } from '../database/entities/email-template.entity.js';
import { Suppression } from '../database/entities/suppression.entity.js';
import { Tenant } from '../database/entities/tenant.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { SmtpProvider } from '../providers/smtp.provider.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { EnqueueMailDto } from './dto/enqueue-mail.dto.js';
import { TestSmtpDto } from './dto/test-smtp.dto.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectRepository(EmailMessage)
    private readonly messagesRepo: Repository<EmailMessage>,
    @InjectRepository(EmailTemplate)
    private readonly templatesRepo: Repository<EmailTemplate>,
    @InjectRepository(Suppression)
    private readonly suppressionsRepo: Repository<Suppression>,
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
    private readonly tenants: TenantsService,
    private readonly smtp: SmtpProvider,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  toPublic(msg: EmailMessage) {
    return {
      id: msg.id,
      tenantId: msg.tenantId,
      idempotencyKey: msg.idempotencyKey,
      templateKey: msg.templateKey,
      to: msg.toAddresses,
      cc: msg.ccAddresses,
      bcc: msg.bccAddresses,
      replyTo: msg.replyTo,
      subject: msg.subject,
      priority: msg.priority,
      status: msg.status,
      attempts: msg.attempts,
      maxAttempts: msg.maxAttempts,
      providerMessageId: msg.providerMessageId,
      lastError: msg.lastError,
      scheduledAt: msg.scheduledAt,
      sentAt: msg.sentAt,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    };
  }

  async enqueue(tenantId: string, dto: EnqueueMailDto, actor = 'api') {
    const maxRecipients = this.config.get<number>('mail.maxRecipients') ?? 50;
    let to: string[];
    let cc: string[];
    let bcc: string[];
    try {
      to = assertEmails(dto.to, 'to');
      cc = assertEmails(dto.cc || [], 'cc');
      bcc = assertEmails(dto.bcc || [], 'bcc');
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
    if (to.length + cc.length + bcc.length > maxRecipients) {
      throw new BadRequestException(`Too many recipients (max ${maxRecipients})`);
    }

    if (dto.idempotencyKey) {
      const existing = await this.messagesRepo.findOne({
        where: { tenantId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.toPublic(existing);
    }

    await this.assertDailyQuota(tenantId);

    let subject = dto.subject || '';
    let text = dto.text || '';
    let html = dto.html || '';
    const variables = dto.variables || {};

    if (dto.templateKey) {
      const tpl = await this.templatesRepo.findOne({
        where: { tenantId, key: dto.templateKey, active: true },
      });
      if (!tpl) throw new BadRequestException('Template not found or inactive');
      subject = renderTemplate(tpl.subjectTemplate, variables);
      text = renderTemplate(tpl.textTemplate, variables);
      html = renderTemplate(tpl.htmlTemplate, variables);
    }

    if (!subject.trim()) throw new BadRequestException('subject is required');
    if (!text.trim() && !html.trim()) {
      throw new BadRequestException('text or html body is required');
    }

    if (html && this.config.get<boolean>('mail.allowHtml') !== false) {
      html = sanitizeEmailHtml(html);
    } else {
      html = '';
    }

    // Drop suppressed recipients
    const all = [...to, ...cc, ...bcc];
    const suppressed = await this.suppressionsRepo.find({
      where: { tenantId, email: In(all.map(normalizeEmail)) },
    });
    const blocked = new Set(suppressed.map((s) => s.email));
    to = to.filter((e) => !blocked.has(e));
    cc = cc.filter((e) => !blocked.has(e));
    bcc = bcc.filter((e) => !blocked.has(e));

    if (!to.length) {
      const msg = await this.messagesRepo.save(
        this.messagesRepo.create({
          tenantId,
          idempotencyKey: dto.idempotencyKey ?? null,
          templateKey: dto.templateKey ?? null,
          toAddresses: dto.to.map(normalizeEmail),
          ccAddresses: (dto.cc || []).map(normalizeEmail),
          bccAddresses: (dto.bcc || []).map(normalizeEmail),
          replyTo: dto.replyTo ? normalizeEmail(dto.replyTo) : null,
          subject,
          textBody: text,
          htmlBody: html,
          headers: this.sanitizeHeaders(dto.headers),
          variables,
          priority: dto.priority ?? MailPriority.NORMAL,
          status: MailStatus.SUPPRESSED,
          scheduledAt: new Date(),
          lastError: 'All recipients suppressed',
        }),
      );
      await this.audit(tenantId, msg.id, AuditAction.SUPPRESSED, actor, true, {
        blocked: [...blocked],
      });
      return this.toPublic(msg);
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt');
    }

    const msg = await this.messagesRepo.save(
      this.messagesRepo.create({
        tenantId,
        idempotencyKey: dto.idempotencyKey ?? null,
        templateKey: dto.templateKey ?? null,
        toAddresses: to,
        ccAddresses: cc,
        bccAddresses: bcc,
        replyTo: dto.replyTo ? normalizeEmail(dto.replyTo) : null,
        subject,
        textBody: text,
        htmlBody: html,
        headers: this.sanitizeHeaders(dto.headers),
        variables,
        priority: dto.priority ?? MailPriority.NORMAL,
        status: MailStatus.QUEUED,
        scheduledAt,
        maxAttempts: this.config.get<number>('pgBoss.retryLimit') ?? 8,
      }),
    );

    await this.audit(tenantId, msg.id, AuditAction.ENQUEUE, actor, true, {
      toCount: to.length,
    });
    await this.jobs.enqueue(
      JobQueue.SEND_MAIL,
      { messageId: msg.id },
      { singletonKey: msg.id },
    );
    return this.toPublic(msg);
  }

  async get(tenantId: string, id: string) {
    const msg = await this.messagesRepo.findOne({ where: { id, tenantId } });
    if (!msg) throw new NotFoundException('Message not found');
    return this.toPublic(msg);
  }

  async list(tenantId: string, opts: { status?: MailStatus; page?: number; limit?: number }) {
    const page = opts.page ?? 1;
    const limit = Math.min(100, opts.limit ?? 25);
    const where: Record<string, unknown> = { tenantId };
    if (opts.status) where.status = opts.status;
    const [rows, total] = await this.messagesRepo.findAndCount({
      where: where as never,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map((r) => this.toPublic(r)), total, page, limit };
  }

  async pickDue(limit: number): Promise<EmailMessage[]> {
    return this.messagesRepo.find({
      where: {
        status: MailStatus.QUEUED,
        scheduledAt: LessThanOrEqual(new Date()),
      },
      order: { priority: 'DESC', scheduledAt: 'ASC' },
      take: limit,
    });
  }

  async deliver(messageId: string): Promise<void> {
    const msg = await this.messagesRepo.findOne({ where: { id: messageId } });
    if (!msg) return;
    if (msg.status !== MailStatus.QUEUED && msg.status !== MailStatus.SENDING) {
      return;
    }

    msg.status = MailStatus.SENDING;
    msg.attempts += 1;
    await this.messagesRepo.save(msg);

    const smtp = await this.tenants.resolveSmtpConfig(msg.tenantId);
    if (!smtp) {
      await this.fail(msg, 'SMTP is not configured for tenant', false);
      return;
    }

    try {
      const result = await this.smtp.send({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        pass: smtp.pass,
        from: smtp.from,
        to: msg.toAddresses,
        cc: msg.ccAddresses,
        bcc: msg.bccAddresses,
        replyTo: msg.replyTo,
        subject: msg.subject,
        text: msg.textBody,
        html: msg.htmlBody || undefined,
        headers: {
          ...msg.headers,
          'X-WMS-Email-Id': msg.id,
          'X-WMS-Tenant-Id': msg.tenantId,
        },
      });
      msg.status = MailStatus.SENT;
      msg.sentAt = new Date();
      msg.providerMessageId = result.messageId || null;
      msg.lastError = '';
      await this.messagesRepo.save(msg);
      await this.audit(msg.tenantId, msg.id, AuditAction.SEND_OK, 'worker', true, {
        providerMessageId: result.messageId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = msg.attempts < msg.maxAttempts;
      await this.fail(msg, message, retryable);
    }
  }

  private async fail(msg: EmailMessage, error: string, retryable: boolean) {
    msg.lastError = error.slice(0, 2000);
    if (retryable) {
      msg.status = MailStatus.QUEUED;
      const delaySec = Math.min(900, 30 * Math.pow(2, Math.max(0, msg.attempts - 1)));
      msg.scheduledAt = new Date(Date.now() + delaySec * 1000);
      await this.messagesRepo.save(msg);
      await this.jobs.enqueue(
        JobQueue.SEND_MAIL,
        { messageId: msg.id },
        { singletonKey: `${msg.id}:${msg.attempts}`, startAfter: delaySec },
      );
    } else {
      msg.status = MailStatus.FAILED;
      await this.messagesRepo.save(msg);
    }
    await this.audit(msg.tenantId, msg.id, AuditAction.SEND_FAIL, 'worker', false, {
      error,
      attempts: msg.attempts,
      retryable,
    });
    this.logger.warn({ id: msg.id, error, retryable }, 'Email send failed');
  }

  private async assertDailyQuota(tenantId: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const sentToday = await this.messagesRepo
      .createQueryBuilder('m')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.created_at >= :start', { start })
      .andWhere('m.status IN (:...statuses)', {
        statuses: [MailStatus.QUEUED, MailStatus.SENDING, MailStatus.SENT],
      })
      .getCount();
    if (sentToday >= tenant.dailyQuota) {
      throw new BadRequestException('Daily email quota exceeded');
    }
  }

  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};
    const out: Record<string, string> = {};
    const blocked = new Set([
      'to',
      'from',
      'cc',
      'bcc',
      'subject',
      'content-type',
      'mime-version',
    ]);
    for (const [k, v] of Object.entries(headers)) {
      const key = String(k).trim();
      if (!key || blocked.has(key.toLowerCase())) continue;
      if (!/^[a-zA-Z0-9-]+$/.test(key)) continue;
      out[key] = String(v).slice(0, 500);
    }
    return out;
  }

  private async audit(
    tenantId: string,
    messageId: string | null,
    action: AuditAction,
    actor: string,
    success: boolean,
    detail: Record<string, unknown>,
  ) {
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        messageId,
        action,
        actor,
        success,
        detail,
      }),
    );
  }

  async sendSmtpTest(tenantId: string, input: TestSmtpDto) {
    const inlineUser = String(input.username || '').trim();
    const inlinePass = input.password ? String(input.password) : '';
    const stored = await this.tenants.getTenantSmtp(tenantId);
    const host = String(input.host || stored?.host || '').trim();
    const fromAddress = String(input.fromAddress || stored?.fromAddress || '').trim();
    const fromName = String(input.fromName ?? stored?.fromName ?? '').trim();
    const port = Number(input.port ?? stored?.port ?? 587);
    const secure = Boolean(input.secure ?? stored?.secure ?? false);
    const user = inlineUser || String(stored?.user || '').trim();
    const pass = inlinePass || String(stored?.pass || '');

    if (!host || !fromAddress) {
      throw new BadRequestException('SMTP host and from address are required');
    }
    if (!user || !pass) {
      if (stored && stored.secretsReadable === false) {
        throw new BadRequestException(
          'Stored SMTP secrets cannot be decrypted (ENCRYPTION_KEY changed). Re-enter username and password, click Save, then Test again.',
        );
      }
      throw new BadRequestException(
        'SMTP username and password are required. Enter them, or save them first.',
      );
    }

    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
    try {
      const result = await this.smtp.send({
        host,
        port,
        secure,
        user,
        pass,
        from,
        to: input.to,
        subject: '[WMS Linker] SMTP Test',
        text: 'This is a test email from WMS Linker. Your SMTP settings are working correctly.',
        html: '<div style="font-family:sans-serif;padding:20px;"><h2>SMTP Test Successful</h2><p>Your email notifications are configured correctly.</p></div>',
      });
      return { success: true, to: input.to, messageId: result.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SMTP test failed';
      this.logger.warn({ tenantId, host, message }, 'SMTP test failed');
      throw new BadRequestException(message);
    }
  }

  async metricsSummary() {
    const byStatus = await this.messagesRepo
      .createQueryBuilder('m')
      .select('m.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('m.status')
      .getRawMany<{ status: string; count: string }>();
    return {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
    };
  }
}
