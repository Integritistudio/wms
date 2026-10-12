import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MailPriority } from '../../common/enums.js';

export class EnqueueMailDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  to!: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @ApiPropertyOptional({ description: 'Use a stored template key' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(998)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ enum: MailPriority })
  @IsOptional()
  @IsEnum(MailPriority)
  priority?: MailPriority;

  @ApiPropertyOptional({ description: 'Deduplicate enqueue within tenant' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'ISO datetime to schedule send' })
  @IsOptional()
  @IsString()
  scheduledAt?: string;
}
