import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import {
  AckDto,
  ActorDto,
  BulkActionDto,
  NoteDto,
  ReassignDto,
} from '../failures/dto/action.dto.js';
import { IngestFailureDto } from '../failures/dto/ingest-failure.dto.js';
import { ListFailuresQueryDto } from '../failures/dto/list-failures.query.dto.js';
import { FailuresService } from '../failures/failures.service.js';
import { UpdatePolicyDto } from '../policies/dto/update-policy.dto.js';
import { PoliciesService } from '../policies/policies.service.js';
import { TenantsService } from '../tenants/tenants.service.js';

@ApiTags('admin-failures')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminFailuresController {
  constructor(
    private readonly failures: FailuresService,
    private readonly tenants: TenantsService,
    private readonly policies: PoliciesService,
  ) {}

  private async tenantIdForCompany(companyId: string): Promise<string> {
    const { tenant } = await this.tenants.ensureByExternalCompanyId({
      externalCompanyId: String(companyId),
    });
    return tenant.id;
  }

  @Post('failures')
  async ingest(@Body() dto: IngestFailureDto) {
    const tenantId = await this.tenantIdForCompany(dto.companyId);
    return this.failures.ingest(tenantId, dto);
  }

  @Get('failures')
  async list(
    @Query('companyId') companyId: string,
    @Query() query: ListFailuresQueryDto,
  ) {
    if (!companyId) {
      return { items: [], total: 0, page: 1, limit: query.limit ?? 25 };
    }
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.list(tenantId, query);
  }

  @Get('failures/count')
  async count(
    @Query('companyId') companyId: string,
    @Query('warehouseIds') warehouseIds?: string,
  ) {
    if (!companyId) return { count: 0 };
    const tenantId = await this.tenantIdForCompany(companyId);
    const ids = warehouseIds
      ? warehouseIds.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    return { count: await this.failures.countOpen(tenantId, ids) };
  }

  @Post('failures/bulk')
  async bulk(
    @Query('companyId') companyId: string,
    @Body() body: BulkActionDto,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.bulk(tenantId, body);
  }

  @Get('failures/:id')
  async get(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.getPublic(tenantId, id);
  }

  @Post('failures/:id/retry')
  async retry(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() body: ActorDto,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.retry(tenantId, id, body.actor, false);
  }

  @Post('failures/:id/reassign')
  async reassign(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() body: ReassignDto,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.reassign(tenantId, id, body.warehouseId, body.actor);
  }

  @Post('failures/:id/skip')
  async skip(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() body: ActorDto,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.skip(tenantId, id, body.actor);
  }

  @Post('failures/:id/note')
  async note(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() body: NoteDto,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.addNote(tenantId, id, body.note, body.actor);
  }

  @Post('failures/:id/ack')
  async ack(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() body: AckDto,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.failures.ack(tenantId, id, body);
  }

  @Get('retry-policies')
  async getPolicy(@Query('companyId') companyId: string) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.policies.get(tenantId);
  }

  @Put('retry-policies')
  async updatePolicy(
    @Query('companyId') companyId: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const tenantId = await this.tenantIdForCompany(companyId);
    return this.policies.update(tenantId, dto);
  }
}
