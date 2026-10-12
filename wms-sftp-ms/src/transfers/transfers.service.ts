import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  AuditAction,
  EdiDocumentType,
  JobQueue,
  TransferDirection,
  TransferStatus,
} from '../common/enums.js';
import { posixJoin } from '../common/security/host.util.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Transfer } from '../database/entities/transfer.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { SftpClientService } from '../sftp/sftp-client.service.js';
import { EnqueueTransferDto } from './dto/enqueue-transfer.dto.js';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    @InjectRepository(Transfer)
    private readonly transfersRepo: Repository<Transfer>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
    private readonly connections: ConnectionsService,
    private readonly sftp: SftpClientService,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  toPublic(t: Transfer) {
    return {
      id: t.id,
      tenantId: t.tenantId,
      connectionId: t.connectionId,
      direction: t.direction,
      documentType: t.documentType,
      fileName: t.fileName,
      remotePath: t.remotePath,
      status: t.status,
      attempts: t.attempts,
      maxAttempts: t.maxAttempts,
      lastError: t.lastError,
      bytes: t.bytes,
      durationMs: t.durationMs,
      idempotencyKey: t.idempotencyKey,
      externalOrderId: t.externalOrderId,
      externalGroupId: t.externalGroupId,
      scheduledAt: t.scheduledAt,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async enqueue(tenantId: string, dto: EnqueueTransferDto, actor = 'api') {
    const max = this.config.get<number>('security.maxFileBytes') ?? 5_242_880;
    const bodyBuf = Buffer.from(dto.body, 'utf8');
    if (bodyBuf.length > max) {
      throw new BadRequestException(`File exceeds max size ${max} bytes`);
    }
    if (dto.idempotencyKey) {
      const existing = await this.transfersRepo.findOne({
        where: { tenantId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.toPublic(existing);
    }

    const conn = await this.connections.get(tenantId, dto.connectionId);
    if (!conn.enabled) {
      throw new BadRequestException('SFTP connection is disabled');
    }

    let remotePath: string;
    try {
      remotePath =
        dto.remotePath || posixJoin(conn.remotePath || '/inbound/940', dto.fileName);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }

    const transfer = await this.transfersRepo.save(
      this.transfersRepo.create({
        tenantId,
        connectionId: conn.id,
        direction: TransferDirection.UPLOAD,
        documentType: dto.documentType ?? EdiDocumentType.EDI_940,
        fileName: dto.fileName,
        remotePath,
        bodyText: dto.body,
        bodyHash: createHash('sha256').update(bodyBuf).digest('hex'),
        idempotencyKey: dto.idempotencyKey ?? null,
        externalOrderId: dto.externalOrderId ?? null,
        externalGroupId: dto.externalGroupId ?? null,
        status: TransferStatus.QUEUED,
        scheduledAt: new Date(),
        bytes: bodyBuf.length,
        maxAttempts: this.config.get<number>('pgBoss.retryLimit') ?? 5,
      }),
    );

    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        connectionId: conn.id,
        transferId: transfer.id,
        action: AuditAction.TRANSFER_ENQUEUE,
        actor,
        detail: { remotePath, fileName: dto.fileName },
      }),
    );
    await this.jobs.enqueue(
      JobQueue.TRANSFER,
      { transferId: transfer.id },
      { singletonKey: transfer.id },
    );
    return this.toPublic(transfer);
  }

  async get(tenantId: string, id: string) {
    const row = await this.transfersRepo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Transfer not found');
    return this.toPublic(row);
  }

  async list(tenantId: string, page = 1, limit = 25) {
    const take = Math.min(100, limit);
    const [rows, total] = await this.transfersRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * take,
      take,
    });
    return { items: rows.map((r) => this.toPublic(r)), total, page, limit: take };
  }

  async pickDue(limit: number) {
    return this.transfersRepo.find({
      where: {
        status: TransferStatus.QUEUED,
        scheduledAt: LessThanOrEqual(new Date()),
      },
      order: { scheduledAt: 'ASC' },
      take: limit,
    });
  }

  async execute(transferId: string) {
    const transfer = await this.transfersRepo.findOne({ where: { id: transferId } });
    if (!transfer) return;
    if (
      transfer.status !== TransferStatus.QUEUED &&
      transfer.status !== TransferStatus.RUNNING
    ) {
      return;
    }

    transfer.status = TransferStatus.RUNNING;
    transfer.attempts += 1;
    await this.transfersRepo.save(transfer);

    const conn = await this.connections.get(transfer.tenantId, transfer.connectionId);
    if (!conn.enabled) {
      transfer.status = TransferStatus.SKIPPED;
      transfer.lastError = 'Connection disabled';
      transfer.completedAt = new Date();
      await this.transfersRepo.save(transfer);
      return;
    }

    const started = Date.now();
    try {
      await this.sftp.put(
        this.connections.authConfig(conn),
        transfer.remotePath,
        Buffer.from(transfer.bodyText || '', 'utf8'),
      );
      transfer.status = TransferStatus.SENT;
      transfer.lastError = '';
      transfer.durationMs = Date.now() - started;
      transfer.completedAt = new Date();
      // Drop body after successful send to reduce PII retention
      transfer.bodyText = null;
      await this.transfersRepo.save(transfer);
      await this.auditRepo.save(
        this.auditRepo.create({
          tenantId: transfer.tenantId,
          connectionId: transfer.connectionId,
          transferId: transfer.id,
          action: AuditAction.TRANSFER_OK,
          detail: { remotePath: transfer.remotePath, durationMs: transfer.durationMs },
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      transfer.lastError = message.slice(0, 2000);
      transfer.durationMs = Date.now() - started;
      const retryable = transfer.attempts < transfer.maxAttempts;
      if (retryable) {
        transfer.status = TransferStatus.QUEUED;
        const delay = Math.min(900, 30 * Math.pow(2, Math.max(0, transfer.attempts - 1)));
        transfer.scheduledAt = new Date(Date.now() + delay * 1000);
        await this.transfersRepo.save(transfer);
        await this.jobs.enqueue(
          JobQueue.TRANSFER,
          { transferId: transfer.id },
          { singletonKey: `${transfer.id}:${transfer.attempts}`, startAfter: delay },
        );
      } else {
        transfer.status = TransferStatus.FAILED;
        transfer.completedAt = new Date();
        await this.transfersRepo.save(transfer);
      }
      await this.auditRepo.save(
        this.auditRepo.create({
          tenantId: transfer.tenantId,
          connectionId: transfer.connectionId,
          transferId: transfer.id,
          action: AuditAction.TRANSFER_FAIL,
          success: false,
          detail: { error: message, attempts: transfer.attempts, retryable },
        }),
      );
      this.logger.warn({ id: transfer.id, message, retryable }, 'SFTP transfer failed');
    }
  }

  async metricsSummary() {
    const byStatus = await this.transfersRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany<{ status: string; count: string }>();
    return {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
    };
  }
}
