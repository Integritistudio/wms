import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module.js';
import { FailuresModule } from '../failures/failures.module.js';
import { AlertWorker } from './alert.worker.js';
import { AutoRetryWorker } from './auto-retry.worker.js';
import { StaleSweepWorker } from './stale-sweep.worker.js';

@Module({
  imports: [FailuresModule, AlertsModule],
  providers: [AutoRetryWorker, AlertWorker, StaleSweepWorker],
})
export class WorkersModule {}
