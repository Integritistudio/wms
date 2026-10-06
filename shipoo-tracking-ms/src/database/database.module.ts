import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as entities from './entities/index.js';
import { MigrationRunnerService } from './migration-runner.service.js';

const entityList = Object.values(entities);

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: entityList,
        synchronize: false,
        logging: config.get('nodeEnv') === 'development',
      }),
    }),
    TypeOrmModule.forFeature(entityList),
  ],
  providers: [MigrationRunnerService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
