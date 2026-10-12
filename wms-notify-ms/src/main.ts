import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('WMS Notify API')
    .setDescription('In-app + push notifications microservice')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'tenant')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'admin')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('port') ?? 8720;
  await app.listen(port);
}
await bootstrap();
