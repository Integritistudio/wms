import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DevicePlatform } from '../../common/enums.js';

export class UpsertDeviceDto {
  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiProperty({ description: 'FCM/APNs token or web-push endpoint URL' })
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token!: string;

  @ApiPropertyOptional({ description: 'Web Push endpoint (defaults to token for web)' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  endpoint?: string;

  @ApiPropertyOptional({ description: 'Web Push p256dh key' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  p256dh?: string;

  @ApiPropertyOptional({ description: 'Web Push auth secret' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  auth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  label?: string;
}
