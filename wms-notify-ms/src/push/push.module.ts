import { Module } from '@nestjs/common';
import { PushProvider } from './push.provider.js';

@Module({
  providers: [PushProvider],
  exports: [PushProvider],
})
export class PushModule {}
