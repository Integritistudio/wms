import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingRecord } from '../database/entities/tracking-record.entity.js';
import { ReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TrackingRecord])],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
