import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker-app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(WorkerAppModule, {
    logger: ['log', 'error', 'warn'],
  });
  await app.init();
  const logger = new Logger('WorkerBootstrap');
  logger.log('Tracking worker started');
}
await bootstrap();
