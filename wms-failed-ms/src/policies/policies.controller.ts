import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { UpdatePolicyDto } from './dto/update-policy.dto.js';
import { PoliciesService } from './policies.service.js';

@ApiTags('retry-policies')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/retry-policies')
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  get(@TenantId() tenantId: string) {
    return this.policies.get(tenantId);
  }

  @Put()
  update(@TenantId() tenantId: string, @Body() dto: UpdatePolicyDto) {
    return this.policies.update(tenantId, dto);
  }
}
