import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { SendMailWorker } from './send-mail.worker.js';

@Module({
  imports: [MailModule],
  providers: [SendMailWorker],
})
export class WorkersModule {}
