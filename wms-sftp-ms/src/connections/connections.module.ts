import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { SftpConnection } from '../database/entities/sftp-connection.entity.js';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([SftpConnection, ActionAudit])],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
