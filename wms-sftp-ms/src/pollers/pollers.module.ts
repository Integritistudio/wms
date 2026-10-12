import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectionsModule } from '../connections/connections.module.js';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { InboundFile } from '../database/entities/inbound-file.entity.js';
import { InboundPoller } from '../database/entities/inbound-poller.entity.js';
import { PollersController } from './pollers.controller.js';
import { PollersService } from './pollers.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([InboundPoller, InboundFile, ActionAudit]),
    ConnectionsModule,
  ],
  controllers: [PollersController],
  providers: [PollersService],
  exports: [PollersService],
})
export class PollersModule {}
