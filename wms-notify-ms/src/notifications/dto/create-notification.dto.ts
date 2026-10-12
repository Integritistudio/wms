import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateNotificationDto {
  @ApiPropertyOptional({ example: 'order_error' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Linker member / user id' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({ example: ['in_app', 'push'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
