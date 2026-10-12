import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EdiDocumentType } from '../../common/enums.js';

export class EnqueueTransferDto {
  @ApiProperty({ description: 'SFTP connection UUID in this service' })
  @IsString()
  connectionId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: 'EDI / file body text' })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ enum: EdiDocumentType, default: EdiDocumentType.EDI_940 })
  @IsOptional()
  @IsEnum(EdiDocumentType)
  documentType?: EdiDocumentType;

  @ApiPropertyOptional({ description: 'Override remote directory+file' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  remotePath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalGroupId?: string;
}
