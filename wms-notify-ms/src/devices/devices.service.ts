import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction, DevicePlatform } from '../common/enums.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { UpsertDeviceDto } from './dto/upsert-device.dto.js';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(ActionAudit)
    private readonly auditRepo: Repository<ActionAudit>,
  ) {}

  toPublic(row: Device) {
    return {
      id: row.id,
      platform: row.platform,
      tokenPreview: `${row.token.slice(0, 12)}…`,
      userId: row.externalUserId,
      label: row.label,
      enabled: row.enabled,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
    };
  }

  async upsert(tenantId: string, dto: UpsertDeviceDto, actor = 'tenant') {
    let row = await this.devicesRepo.findOne({
      where: { tenantId, token: dto.token },
    });
    if (!row) {
      row = this.devicesRepo.create({
        tenantId,
        token: dto.token,
        platform: dto.platform,
      });
    }
    row.platform = dto.platform;
    row.externalUserId = dto.userId || null;
    row.endpoint =
      dto.endpoint || (dto.platform === DevicePlatform.WEB ? dto.token : null);
    row.p256dh = dto.p256dh || null;
    row.auth = dto.auth || null;
    row.label = dto.label || null;
    row.enabled = true;
    row.lastSeenAt = new Date();
    const saved = await this.devicesRepo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.DEVICE_UPSERT,
        actor,
        detail: { deviceId: saved.id, platform: saved.platform },
      }),
    );
    return this.toPublic(saved);
  }

  list(tenantId: string) {
    return this.devicesRepo
      .find({ where: { tenantId }, order: { updatedAt: 'DESC' } })
      .then((rows) => rows.map((r) => this.toPublic(r)));
  }

  async disable(tenantId: string, id: string, actor = 'tenant') {
    const row = await this.devicesRepo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Device not found');
    row.enabled = false;
    await this.devicesRepo.save(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        tenantId,
        action: AuditAction.DEVICE_DISABLE,
        actor,
        detail: { deviceId: id },
      }),
    );
    return this.toPublic(row);
  }

  getById(id: string) {
    return this.devicesRepo.findOne({ where: { id } });
  }
}
