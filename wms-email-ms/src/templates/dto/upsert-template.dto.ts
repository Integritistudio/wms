import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpsertTemplateDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9._-]+$/)
  key!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subjectTemplate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textTemplate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  htmlTemplate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
