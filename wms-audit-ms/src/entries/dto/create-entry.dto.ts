import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEntryDto {
  @ApiProperty({ example: 'order_flow' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fromState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  toState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  correlationId?: string;
}
