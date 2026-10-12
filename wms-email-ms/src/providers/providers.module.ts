import { Global, Module } from '@nestjs/common';
import { SmtpProvider } from './smtp.provider.js';

@Global()
@Module({
  providers: [SmtpProvider],
  exports: [SmtpProvider],
})
export class ProvidersModule {}
