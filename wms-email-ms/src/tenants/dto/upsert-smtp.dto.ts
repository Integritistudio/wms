import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertSmtpDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host!: string;

  @ApiPropertyOptional({ default: 587 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string;

  @ApiProperty()
  @IsEmail()
  fromAddress!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromName?: string;
}
