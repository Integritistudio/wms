import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { DomainEventType } from '../../common/enums.js';

export class CreateWebhookDestinationDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ enum: DomainEventType, isArray: true })
  @IsArray()
  @IsEnum(DomainEventType, { each: true })
  eventTypes!: DomainEventType[];
}
