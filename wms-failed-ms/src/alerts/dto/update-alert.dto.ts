import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateAlertDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  depthThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  ageThresholdMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(30)
  cooldownSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailTo?: string | null;
}
