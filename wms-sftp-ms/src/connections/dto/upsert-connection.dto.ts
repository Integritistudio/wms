import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertConnectionDto {
  @ApiPropertyOptional({ description: 'Linker SFTP connection Mongo id' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host!: string;

  @ApiPropertyOptional({ default: 22 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  username!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  privateKey?: string;

  @ApiPropertyOptional({ default: '/inbound/940' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remotePath?: string;

  @ApiPropertyOptional({ default: '/outbound/945' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  inboundPath?: string;
}
