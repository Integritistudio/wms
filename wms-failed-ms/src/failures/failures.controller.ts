import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import {
  AckDto,
  ActorDto,
  BulkActionDto,
  NoteDto,
  ReassignDto,
} from './dto/action.dto.js';
import { IngestFailureDto } from './dto/ingest-failure.dto.js';
import { ListFailuresQueryDto } from './dto/list-failures.query.dto.js';
import { FailuresService } from './failures.service.js';

@ApiTags('failures')
@ApiBearerAuth('tenant')
@UseGuards(ApiKeyGuard)
@Controller('v1/failures')
export class FailuresController {
  constructor(private readonly failures: FailuresService) {}

  @Post()
  ingest(@TenantId() tenantId: string, @Body() dto: IngestFailureDto) {
    return this.failures.ingest(tenantId, dto);
  }

  @Get()
  list(@TenantId() tenantId: string, @Query() query: ListFailuresQueryDto) {
    return this.failures.list(tenantId, query);
  }

  @Get('count')
  async count(
    @TenantId() tenantId: string,
    @Query('warehouseIds') warehouseIds?: string,
  ) {
    const ids = warehouseIds
      ? warehouseIds.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const count = await this.failures.countOpen(tenantId, ids);
    return { count };
  }

  @Post('bulk')
  bulk(@TenantId() tenantId: string, @Body() dto: BulkActionDto) {
    return this.failures.bulk(tenantId, dto);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.failures.getPublic(tenantId, id);
  }

  @Post(':id/retry')
  retry(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: ActorDto = {},
  ) {
    return this.failures.retry(tenantId, id, body?.actor, false);
  }

  @Post(':id/reassign')
  reassign(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: ReassignDto,
  ) {
    return this.failures.reassign(tenantId, id, body.warehouseId, body.actor);
  }

  @Post(':id/skip')
  skip(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: ActorDto = {},
  ) {
    return this.failures.skip(tenantId, id, body?.actor);
  }

  @Post(':id/note')
  note(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: NoteDto,
  ) {
    return this.failures.addNote(tenantId, id, body.note, body.actor);
  }

  @Post(':id/ack')
  ack(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: AckDto,
  ) {
    return this.failures.ack(tenantId, id, body);
  }
}
