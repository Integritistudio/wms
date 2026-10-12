import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Device, ActionAudit])],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
