import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { assertSafeSftpHost } from '../common/security/host.util.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { SftpConnection } from '../database/entities/sftp-connection.entity.js';
import { SftpClientService } from '../sftp/sftp-client.service.js';
import { UpsertConnectionDto } from './dto/upsert-connection.dto.js';

@Injectable()
export class ConnectionsService {
  constructor(
    @InjectRepository(SftpConnection)
    private readonly repo: Repository<SftpConnection>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
    private readonly encryption: EncryptionService,
    private readonly sftp: SftpClientService,
    private readonly config: ConfigService,
  ) {}

  toPublic(row: SftpConnection) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      externalId: row.externalId,
      name: row.name,
      enabled: row.enabled,
      host: row.host,
      port: row.port,
      username: row.username,
      remotePath: row.remotePath,
      inboundPath: row.inboundPath,
      passwordSet: Boolean(row.passwordCiphertext),
      privateKeySet: Boolean(row.privateKeyCiphertext),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  list(tenantId: string) {
    return this.repo
      .find({ where: { tenantId }, order: { createdAt: 'DESC' } })
      .then((rows) => rows.map((r) => this.toPublic(r)));
  }

  async get(tenantId: string, id: string) {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Connection not found');
    return row;
  }

  async upsert(tenantId: string, dto: UpsertConnectionDto) {
    assertSafeSftpHost(
      dto.host,
      Boolean(this.config.get('security.allowPrivateHosts')),
    );
    let row: SftpConnection | null = null;
    if (dto.externalId) {
      row = await this.repo.findOne({
        where: { tenantId, externalId: dto.externalId },
      });
    }
    if (!row) row = this.repo.create({ tenantId });
    row.externalId = dto.externalId ?? row.externalId ?? null;
    row.name = dto.name;
    row.enabled = dto.enabled ?? row.enabled ?? false;
    row.host = dto.host;
    row.port = dto.port ?? 22;
    row.username = dto.username;
    row.remotePath = dto.remotePath || '/inbound/940';
    row.inboundPath = dto.inboundPath || '/outbound/945';
    if (dto.password !== undefined) {
      row.passwordCiphertext = dto.password
        ? this.encryption.encrypt(dto.password)
        : null;
    }
    if (dto.privateKey !== undefined) {
      row.privateKeyCiphertext = dto.privateKey
        ? this.encryption.encrypt(dto.privateKey)
        : null;
    }
    const saved = await this.repo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        connectionId: saved.id,
        action: AuditAction.CONNECTION_UPSERT,
        detail: { name: saved.name, host: saved.host },
      }),
    );
    return this.toPublic(saved);
  }

  authConfig(row: SftpConnection) {
    return {
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.passwordCiphertext
        ? this.encryption.decrypt(row.passwordCiphertext)
        : undefined,
      privateKey: row.privateKeyCiphertext
        ? this.encryption.decrypt(row.privateKeyCiphertext)
        : undefined,
    };
  }

  async test(tenantId: string, id: string) {
    const row = await this.get(tenantId, id);
    try {
      const result = await this.sftp.test(this.authConfig(row));
      await this.auditRepo.save(
        this.auditRepo.create({
          tenantId,
          connectionId: id,
          action: AuditAction.CONNECTION_TEST,
          success: true,
        }),
      );
      return result;
    } catch (err) {
      await this.auditRepo.save(
        this.auditRepo.create({
          tenantId,
          connectionId: id,
          action: AuditAction.CONNECTION_TEST,
          success: false,
          detail: { error: err instanceof Error ? err.message : String(err) },
        }),
      );
      throw err;
    }
  }
}
