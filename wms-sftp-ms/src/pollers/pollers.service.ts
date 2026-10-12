import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditAction, EdiDocumentType } from '../common/enums.js';
import { matchGlob, posixJoin } from '../common/security/host.util.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { InboundFile } from '../database/entities/inbound-file.entity.js';
import { InboundPoller } from '../database/entities/inbound-poller.entity.js';
import { SftpClientService } from '../sftp/sftp-client.service.js';
import { UpsertPollerDto } from './dto/upsert-poller.dto.js';

@Injectable()
export class PollersService {
  private readonly logger = new Logger(PollersService.name);

  constructor(
    @InjectRepository(InboundPoller)
    private readonly pollersRepo: Repository<InboundPoller>,
    @InjectRepository(InboundFile)
    private readonly filesRepo: Repository<InboundFile>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
    private readonly connections: ConnectionsService,
    private readonly sftp: SftpClientService,
    private readonly config: ConfigService,
  ) {}

  async upsert(tenantId: string, dto: UpsertPollerDto) {
    await this.connections.get(tenantId, dto.connectionId);
    let row = await this.pollersRepo.findOne({
      where: { connectionId: dto.connectionId },
    });
    if (!row) {
      row = this.pollersRepo.create({
        tenantId,
        connectionId: dto.connectionId,
      });
    }
    row.enabled = dto.enabled ?? true;
    row.remotePath = dto.remotePath || '/outbound/945';
    row.fileGlob = dto.fileGlob || '*.edi';
    row.deleteAfterFetch = Boolean(dto.deleteAfterFetch);
    const saved = await this.pollersRepo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        connectionId: dto.connectionId,
        action: AuditAction.POLLER_UPSERT,
        detail: { remotePath: saved.remotePath },
      }),
    );
    return saved;
  }

  list(tenantId: string) {
    return this.pollersRepo.find({ where: { tenantId } });
  }

  async pollAll(): Promise<void> {
    const pollers = await this.pollersRepo.find({ where: { enabled: true } });
    for (const poller of pollers) {
      try {
        await this.pollOne(poller);
      } catch (err) {
        this.logger.warn(
          { err, pollerId: poller.id },
          'Inbound poll failed',
        );
      }
    }
  }

  private async pollOne(poller: InboundPoller) {
    const conn = await this.connections.get(poller.tenantId, poller.connectionId);
    if (!conn.enabled) return;
    const auth = this.connections.authConfig(conn);
    const entries = await this.sftp.list(auth, poller.remotePath);
    for (const entry of entries) {
      if (!matchGlob(entry.name, poller.fileGlob)) continue;
      const remotePath = posixJoin(poller.remotePath, entry.name);
      const buf = await this.sftp.get(auth, remotePath);
      const body = buf.toString('utf8');
      const bodyHash = createHash('sha256').update(buf).digest('hex');
      const existing = await this.filesRepo.findOne({
        where: { tenantId: poller.tenantId, bodyHash },
      });
      if (existing) continue;

      const saved = await this.filesRepo.save(
        this.filesRepo.create({
          tenantId: poller.tenantId,
          connectionId: poller.connectionId,
          remotePath,
          fileName: entry.name,
          bodyHash,
          bodyText: body,
          documentType: entry.name.includes('945')
            ? EdiDocumentType.EDI_945
            : EdiDocumentType.OTHER,
          delivered: false,
        }),
      );
      await this.auditRepo.save(
        this.auditRepo.create({
          tenantId: poller.tenantId,
          connectionId: poller.connectionId,
          action: AuditAction.INBOUND_FOUND,
          detail: { fileName: entry.name, remotePath },
        }),
      );
      await this.deliverToLinker(saved);
      if (poller.deleteAfterFetch) {
        await this.sftp.remove(auth, remotePath);
      }
    }
    poller.lastPolledAt = new Date();
    await this.pollersRepo.save(poller);
  }

  private async deliverToLinker(file: InboundFile) {
    const base = this.config.get<string>('linker.baseUrl') || '';
    const secret = this.config.get<string>('linker.callbackSecret') || '';
    if (!base || !secret) {
      this.logger.warn('Linker callback not configured; inbound file stored only');
      return;
    }
    try {
      const res = await fetch(`${base}/api/internal/sftp-ms/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sftp-Ms-Secret': secret,
        },
        body: JSON.stringify({
          tenantId: file.tenantId,
          connectionId: file.connectionId,
          fileName: file.fileName,
          remotePath: file.remotePath,
          documentType: file.documentType,
          body: file.bodyText,
          bodyHash: file.bodyHash,
        }),
      });
      if (res.ok) {
        file.delivered = true;
        await this.filesRepo.save(file);
        await this.auditRepo.save(
          this.auditRepo.create({
            tenantId: file.tenantId,
            connectionId: file.connectionId,
            action: AuditAction.INBOUND_DELIVERED,
            detail: { fileName: file.fileName },
          }),
        );
      } else {
        this.logger.warn({ status: res.status }, 'Linker inbound callback failed');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Linker inbound callback error');
    }
  }
}
