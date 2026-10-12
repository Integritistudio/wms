import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker-app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(WorkerAppModule, {
    logger: ['log', 'error', 'warn'],
  });
  await app.init();
  new Logger('WorkerBootstrap').log('Email worker started');
}
await bootstrap();
