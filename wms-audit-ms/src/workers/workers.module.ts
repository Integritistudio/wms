import { Module } from '@nestjs/common';
import { EntriesModule } from '../entries/entries.module.js';
import { PurgeWorker } from './purge.worker.js';

@Module({
  imports: [EntriesModule],
  providers: [PurgeWorker],
})
export class WorkersModule {}
