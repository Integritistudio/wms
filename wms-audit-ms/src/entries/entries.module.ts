import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEntry } from '../database/entities/audit-entry.entity.js';
import { EntriesController } from './entries.controller.js';
import { EntriesService } from './entries.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEntry])],
  controllers: [EntriesController],
  providers: [EntriesService],
  exports: [EntriesService],
})
export class EntriesModule {}
