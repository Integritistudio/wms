import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalCompanyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  dailyQuota?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  apiKeyLabel?: string;
}
