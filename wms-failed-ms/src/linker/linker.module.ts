import { Global, Module } from '@nestjs/common';
import { LinkerCallbackClient } from './linker-callback.client.js';

@Global()
@Module({
  providers: [LinkerCallbackClient],
  exports: [LinkerCallbackClient],
})
export class LinkerModule {}
