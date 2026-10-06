import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { NormalizedTrackingStatus } from '../../common/enums.js';

export class ListTrackingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalShipmentId?: string;

  @ApiPropertyOptional({ enum: NormalizedTrackingStatus })
  @IsOptional()
  @IsEnum(NormalizedTrackingStatus)
  status?: NormalizedTrackingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
