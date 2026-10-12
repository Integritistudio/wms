import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { AddSuppressionDto } from './dto/suppression.dto.js';
import { SuppressionsService } from './suppressions.service.js';

@ApiTags('suppressions')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/suppressions')
export class SuppressionsController {
  constructor(private readonly suppressions: SuppressionsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.suppressions.list(tenantId);
  }

  @Post()
  add(@TenantId() tenantId: string, @Body() dto: AddSuppressionDto) {
    return this.suppressions.add(tenantId, dto);
  }

  @Delete(':email')
  remove(@TenantId() tenantId: string, @Param('email') email: string) {
    return this.suppressions.remove(tenantId, decodeURIComponent(email));
  }
}
