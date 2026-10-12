import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPreferenceDto {
  @ApiProperty({ example: 'order_error' })
  @IsString()
  @MaxLength(64)
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}
