import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetShippoCredentialDto {
  @ApiPropertyOptional({ description: 'Per-tenant Shippo API token; omit to use platform token' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  shippoApiToken?: string;
}
