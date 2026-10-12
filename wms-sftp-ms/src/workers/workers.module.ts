import { Module } from '@nestjs/common';
import { PollersModule } from '../pollers/pollers.module.js';
import { TransfersModule } from '../transfers/transfers.module.js';
import { TransferWorker } from './transfer.worker.js';

@Module({
  imports: [TransfersModule, PollersModule],
  providers: [TransferWorker],
})
export class WorkersModule {}
