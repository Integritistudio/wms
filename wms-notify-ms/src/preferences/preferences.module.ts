import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionAudit } from '../database/entities/action-audit.entity.js';
import { Preference } from '../database/entities/preference.entity.js';
import { PreferencesController } from './preferences.controller.js';
import { PreferencesService } from './preferences.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Preference, ActionAudit])],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
