import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPollerDto {
  @ApiProperty()
  @IsString()
  connectionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: '/outbound/945' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remotePath?: string;

  @ApiPropertyOptional({ default: '*.edi' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fileGlob?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deleteAfterFetch?: boolean;
}
