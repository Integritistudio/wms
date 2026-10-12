import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectionsModule } from '../connections/connections.module.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Transfer } from '../database/entities/transfer.entity.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer, ActionAudit]),
    ConnectionsModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
