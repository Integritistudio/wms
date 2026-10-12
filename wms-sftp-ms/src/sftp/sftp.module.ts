import { Global, Module } from '@nestjs/common';
import { SftpClientService } from './sftp-client.service.js';

@Global()
@Module({
  providers: [SftpClientService],
  exports: [SftpClientService],
})
export class SftpModule {}
